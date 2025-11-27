# Bywise Protocol: Especificação Técnica (v1.0)

**Arquitetura:** Proof-of-Stake (PoS) com Execução Delegada e Validação de Estado.

-----

## 1. Visão Geral e Filosofia

A Bywise prioriza o TPS (Transações Por Segundo) ao remover o gargalo de execução da camada de consenso.

  * **Mineradores:** Não executam smart contracts. Apenas ordenam transações e verificam a consistência de banco de dados (`PreState` vs `CurrentDB`).
  * **Validadores:** Executam a lógica (EVM), geram os conjuntos de leitura/escrita e garantem a integridade da transação.
  * **Block Time:** 5 Segundos.

-----

## 2. Atores da Rede

### 2.1. Client (Usuário)

  * Dono da chave privada.
  * Monta a proposta de transação escolhendo o Validador de confiança.
  * Assina a proposta antes de enviar ao Validador (autorização prévia).

### 2.2. Validator (O Executor)

  * Recebe a proposta já assinada pelo usuário.
  * Executa a lógica (EVM) usando seu estado local ou consultando Padrinhos.
  * Preenche `ReadSet` (chaves e valores lidos) e `WriteSet` (mudanças de estado).
  * Assina a transação como "Fiador" e propaga diretamente para a rede.
  * **Slashing:** Se gerar uma transação fraudulenta, perde o Stake.

### 2.3. Miner (O Ordenador)

  * Monta e publica blocos a cada 5 segundos.
  * Verifica apenas conflitos de chaves de banco de dados (LevelDB).
  * Gera/Valida Checkpoints de estado.

-----

## 3. Estrutura de Dados

### 3.1. A Transação (Autocontida e Stateless)

A transação é completamente autocontida: pode ser validada em paralelo, em qualquer thread, sem acesso a estado externo. Contém todos os dados de entrada (ReadSet com valores) e saída (WriteSet) necessários para verificação.

```go
type Transaction struct {
    ID           Hash

    // Proposta do Usuário (assinada pelo usuário)
    Validator    Address            // Validador escolhido para processar
    From         Address
    To           Address
    Value        BigInt
    Nonce        BigInt             // Proteção contra replay - único por (From, Nonce)
    BlockLimit   uint64             // Bloco máximo para inclusão (0 = sem limite)
    Data         []byte             // CallData EVM
    UserSig      []byte             // Assinatura da proposta (autorização prévia)

    // Evidência de Execução (preenchido pelo Validador)
    SequenceID   uint64             // Ordem (para contratos apadrinhados)
    ReadSet      map[StateKey]Value // Dependências: chaves E valores lidos
    WriteSet     map[StateKey]Value // Mudanças de Estado
    ValidatorSig []byte             // Assinatura do Validador (fiador da execução)
}
```

**Campos de Proteção:**

* **Nonce:** Garante unicidade por conta. O par `(From, Nonce)` deve ser único na blockchain - nenhuma transação com o mesmo par pode ser incluída duas vezes.
* **BlockLimit:** Define a validade temporal da proposta. Se `BlockLimit > 0` e o bloco atual > `BlockLimit`, a transação é rejeitada. Isso permite que o validador reenvie propostas expiradas sem risco de duplicação.

**Hash da Proposta (ProposalHash):**
A proposta do usuário gera um hash determinístico calculado sobre: `Validator + From + To + Value + Nonce + BlockLimit + Data`. Este hash é usado para:
1. Assinatura do usuário (`UserSig`)
2. Identificação de propostas duplicadas antes da execução

**Princípio de Validação Stateless:**
Qualquer nó pode validar uma transação em isolamento total:
1. Carrega os valores de entrada do `ReadSet` (embutidos na transação)
2. Executa a lógica EVM com esses inputs
3. Compara a saída gerada com o `WriteSet` informado
4. Verifica as assinaturas (`UserSig` e `ValidatorSig`)
5. Se tudo bater, a transação é **matematicamente válida**

A inclusão no bloco depende apenas de o Minerador conseguir encaixar o `ReadSet` com o estado atual (último bloco + transações anteriores no bloco sendo montado).

```go
package core

import (
	"bytes"
	"encoding/hex"
	"fmt"
)

// Enum para os tipos de chave (Prefixos)
const (
	KeyTypeAccount      byte = 0x01 // Saldo e Nonce
	KeyTypeStorage      byte = 0x02 // Slots de memória EVM
	KeyTypeCode         byte = 0x03 // Código fonte compilado
	KeyTypeStake        byte = 0x04 // Valor em stake, status, rewards
	KeyTypeWalletConfig byte = 0x05 // Configurações arbitrárias da carteira
)

// StateKey é a representação da chave no banco de dados.
// Na transação e no LevelDB, isso é o que será verificado para conflitos.
type StateKey []byte

// String retorna a representação Hex para logs/debug
func (k StateKey) String() string {
	return hex.EncodeToString(k)
}

// --- Construtores de Chaves (Helpers) ---

// 1. Chave de Conta (Saldo/Nonce)
// Ex: 01 + Endereço
func MakeAccountKey(address [20]byte) StateKey {
	k := make([]byte, 21) // 1 prefixo + 20 address
	k[0] = KeyTypeAccount
	copy(k[1:], address[:])
	return k
}

// 2. Chave de Storage de Smart Contract (EVM)
// Ex: 02 + EndereçoContrato + SlotMemoria
func MakeStorageKey(contractAddress [20]byte, slot [32]byte) StateKey {
	k := make([]byte, 53) // 1 prefix + 20 addr + 32 slot
	k[0] = KeyTypeStorage
	copy(k[1:], contractAddress[:])
	copy(k[21:], slot[:])
	return k
}

// 3. Chave de Código de Contrato
// Ex: 03 + EndereçoContrato
func MakeCodeKey(contractAddress [20]byte) StateKey {
	k := make([]byte, 21)
	k[0] = KeyTypeCode
	copy(k[1:], contractAddress[:])
	return k
}

// 4. Chave de Stake (Validador/Minerador)
// Ex: 04 + Endereço
func MakeStakeKey(address [20]byte) StateKey {
	k := make([]byte, 21)
	k[0] = KeyTypeStake
	copy(k[1:], address[:])
	return k
}

// 5. Chave de Configuração de Carteira
// Ex: 05 + Endereço
func MakeWalletConfigKey(address [20]byte) StateKey {
	k := make([]byte, 21)
	k[0] = KeyTypeWalletConfig
	copy(k[1:], address[:])
	return k
}
```

### 3.2. O Bloco

```go
type Block struct {
    Header       BlockHeader
    Transactions []Transaction
}

type BlockHeader struct {
    Number          uint64
    PreviousHash    Hash
    Timestamp       int64  // Intervalo alvo: 5s
    MinerAddress    Address
    
    // Checkpoint Info (Presente apenas se Number % 50.000 == 0)
    CheckpointCID   string // IPFS Content ID
    CheckpointHash  Hash   // Hash do arquivo TSON para validação de integridade
}
```

-----

## 4. Fluxo da Transação (Otimizado)

O fluxo foi simplificado para **duas etapas**, eliminando o bate-volta entre usuário e validador:

### 4.1. Fluxo Padrão (2 Etapas)

1.  **Proposta Assinada (User -> Validator):** O Usuário monta a proposta (`Validator`, `To`, `Value`, `Nonce`, `BlockLimit`, `Data`), assina com `UserSig` e envia ao Validador escolhido via gRPC.
2.  **Execução e Propagação (Validator -> Network):** O Validador:
    * Verifica se `BlockLimit == 0` ou `BlockLimit >= blocoAtual`
    * Executa a transação na EVM (in-memory)
    * Consulta Padrinhos se necessário (cross-contract)
    * Preenche `ReadSet` (com chaves E valores) e `WriteSet`
    * Assina com `ValidatorSig`
    * Propaga a transação completa para a rede
    * Se a transação falhar por conflito, pode reenviar até `BlockLimit` ser atingido

**Duração:** Todo o processo acontece em milisegundos, sem retorno ao usuário.

### 4.2. Proteção contra Replay e Duplicação

O sistema usa dois mecanismos complementares:

1. **Nonce Único:** O Minerador verifica que nenhuma transação com o mesmo par `(From, Nonce)` existe na blockchain. Isso impede que a mesma proposta seja incluída duas vezes, mesmo que o validador gere IDs diferentes.

2. **BlockLimit:** Define uma janela de validade para a proposta. Após o bloco limite:
   * Transações expiradas são rejeitadas
   * O usuário pode reutilizar o mesmo `Nonce` em uma nova proposta
   * O validador para de tentar incluir propostas expiradas

### 4.3. Vantagens do Novo Fluxo

| Aspecto | Fluxo Antigo (4 etapas) | Fluxo Novo (2 etapas) |
| :--- | :--- | :--- |
| **Latência** | 4 trocas de mensagem | 2 trocas de mensagem |
| **Locks Inter-Padrinhos** | Congelam durante ida-volta do usuário | Resolvidos antes da propagação |
| **Complexidade Cliente** | Alto (aguarda, verifica, re-assina) | Baixo (assina e esquece) |
| **Confiança** | Usuário verifica ReadSet/WriteSet | Usuário confia no Validador escolhido |

### 4.4. Modelo de Confiança

O usuário **escolhe explicitamente** o Validador (campo `Validator` na transação). Ao assinar a proposta:
* Autoriza o Validador a executar a operação em seu nome
* Aceita que o Validador preencherá os Sets corretamente
* Confia no mecanismo de **Slashing** como garantia econômica

Se o Validador agir de forma fraudulenta, perderá 100% do Stake.

-----

## 5. Mineração e Consenso

### 5.1. Mineração por Prioridade (Weighted Sortition)

  * Todos os nós calculam localmente a lista de prioridade para o próximo bloco baseada no `Hash(UltimoBloco) + Stake`.
  * O minerador da vez monta o bloco e o publica.
  * Os demais nós validam se o bloco foi emitido pelo minerador correto e se o `ReadSet` das transações bate com o estado resultante.

### 5.2. Validação de Transações pelo Minerador

O Minerador **não executa EVM**. Apenas verifica consistência de estado:

1. **Para cada transação recebida:**
   * Verifica se `BlockLimit == 0` ou `BlockLimit >= blocoAtual` (transação não expirada)
   * Verifica se o par `(From, Nonce)` não existe na blockchain (nonce único)
   * Verifica se o par `(From, Nonce)` não existe no pool de pendentes (evita duplicatas)

2. **Para cada transação no bloco (em ordem):**
   * Verifica se os valores do `ReadSet` batem com: `EstadoAtual(DB) + WriteSets das transações anteriores`
   * Se bater: aplica o `WriteSet` ao estado em memória
   * Se não bater: rejeita a transação (conflito de estado)

3. **Validação Paralela (opcional):**
   * Transações com `ReadSet` disjuntos podem ser verificadas em paralelo
   * A ordenação final ainda é sequencial para aplicar os `WriteSets`

### 5.3. Tratamento de Fraude (Slashing sem Reversão)

  * **Cenário:** Um validador malicioso cria uma transação matematicamente incorreta (ex: cria moedas do nada), mas com `ReadSet` válido. O Minerador aceita (pois os valores batem).
  * **Detecção:** Outros validadores na rede auditam os blocos. Ao detectarem a fraude (cálculo EVM inválido), emitem uma **Prova de Fraude**.
  * **Consequência:**
      * O Validador fraudulento tem 100% do seu Stake confiscado.
      * O Validador que denunciou recebe uma recompensa.
      * **Estado:** **Não há Reorg/Reversão.** A transação fraudulenta permanece no histórico (imutabilidade), mas o prejuízo financeiro do ataque (perda do Stake) deve ser maior que o ganho da fraude, desincentivando o ataque economicamente.

-----

## 6. Armazenamento e Checkpoints (TSON + IPFS)

### 6.1. Estratégia de Snapshot

Para permitir sincronização rápida sem centralização, a rede gera snapshots periódicos do banco de dados.

  * **Frequência:** A cada **50.000 blocos**.
  * **Janela de Estabilidade:** O snapshot criado no Bloco `N` refere-se ao estado consolidado no Bloco `N - 50.000`.
      * *Motivo:* Garante que o estado salvo já é imutável e não sofrerá reorgs superficiais, garantindo que o hash seja idêntico para todos.

### 6.2. O Arquivo TSON

  * O banco de dados (LevelDB) naquele ponto é exportado para um arquivo **TSON** (Typed JSON).
  * Este arquivo é enviado para a rede **IPFS**.

### 6.3. Validação do Checkpoint

1.  O Minerador do bloco `N` (ex: 100.000) gera o TSON do estado no bloco 50.000.
2.  Calcula o `Hash(ArquivoTSON)`.
3.  Insere o `IPFS_CID` e o `CheckpointHash` no cabeçalho do bloco 100.000.
4.  **Verificação:** Os outros nós, ao receberem o bloco 100.000:
      * Verificam em seus bancos locais qual era o estado no bloco 50.000.
      * Calculam qual seria o hash desse estado.
      * Comparam com o `CheckpointHash` do bloco.
      * **Regra:** Se o hash não bater, o bloco 100.000 é considerado **INVÁLIDO** e rejeitado, exatamente como se tivesse uma transação inválida.

-----

## 7. Stack Tecnológico

  * **Linguagem:** Golang.
  * **Banco de Dados:** **LevelDB** (Armazenamento key-value rápido e eficiente).
  * **Comunicação:** **gRPC** (Protobuf) para tudo.
      * Conexões diretas e eficientes entre nós definidos na topologia da rede ou via *gossip* implementado sobre gRPC streams.
  * **VM:** EVM Customizada (Stateless Execution).

-----

# Bywise Protocol: Especificação de Apadrinhamento e Interações Cross-Contract

**Módulo:** Camada de Validação e Execução
**Versão:** 1.0

## 1. Introdução ao Problema de Concorrência

Em arquiteturas de blockchain paralelas, o acesso simultâneo ao mesmo estado (ex: saldo de um contrato de Token popular) cria "Hotspots". Se múltiplas transações tentam alterar o mesmo saldo simultaneamente, a maioria falhará devido a conflitos de `PreState`, reduzindo drasticamente o TPS efetivo.

A Bywise resolve isto através do mecanismo de **Apadrinhamento de Smart Contracts (Sponsorship)**, que introduz uma camada de sequenciação lógica na memória, antes da mineração.

-----

## 2. Arquitetura do Padrinho (Sponsor Node)

Um **Padrinho** é um Validador que assume a responsabilidade de gerir o estado de um Smart Contract específico na memória RAM (In-Memory State).

### 2.1. Responsabilidades

1.  **Cache de Estado:** Manter o `Storage` atualizado do contrato apadrinhado na RAM.
2.  **Sequenciação:** Receber múltiplas transações, ordená-las e executá-las sequencialmente na memória para gerar `SequenceIDs` válidos.
3.  **Endpoint RPC:** Servir como ponto de entrada preferencial para usuários que interagem com aquele contrato.

-----

## 3. Protocolo de Comunicação Inter-Padrinhos

O desafio surge em transações complexas (DeFi) que envolvem múltiplos contratos (ex: `Router` -\> `Token A` -\> `Token B`), onde cada contrato pode ter um Padrinho diferente.

### 3.1. O Princípio da Soberania de Entrada (Entry-Point Sovereignty)

A regra fundamental da Bywise para chamadas entre contratos é:

> **"O Padrinho do contrato que recebe a chamada inicial (Entry-Point) torna-se o Orquestrador da Transação."**

Se o utilizador chama o Contrato A, o Padrinho A é responsável por recolher os estados de B e C, executar a lógica completa e gerar o `WriteSet` unificado.

### 3.2. Fluxo de Execução Síncrona (gRPC)

Quando o **Padrinho A** (Orquestrador) percebe que a execução requer leitura/escrita no **Contrato B** (gerido pelo **Padrinho B**), ocorre o seguinte fluxo:

1.  **Pausa de Execução:** A VM do Padrinho A pausa a execução ao encontrar a instrução `CALL ContractB`.
2.  **State Lookup (Via gRPC):** O Padrinho A envia uma requisição gRPC rápida e direta ao Padrinho B solicitando o estado atual das chaves necessárias (ou simulação da função).
3.  **Reserva de Intenção (Soft Lock):**
      * Para evitar que o estado mude no Padrinho B enquanto o Padrinho A finaliza o cálculo, o Padrinho A pode solicitar uma "Reserva de Chave" temporária (ex: 500ms).
      * O Padrinho B garante que, nesse intervalo, as chaves solicitadas não serão alteradas por outras transações locais.
4.  **Retorno e Fusão:** O Padrinho B devolve o resultado (outputs e mudanças de estado). O Padrinho A incorpora isso no seu `ReadSet` e `WriteSet` globais.
5.  **Finalização:** O Padrinho A assina a transação contendo as alterações de A e B e propaga para a rede.

**Vantagem do Novo Fluxo:** Como o usuário já assinou a proposta antecipadamente, todo o processo de coordenação inter-padrinhos acontece sem bloqueio de ida-volta ao cliente. Os locks são liberados assim que o Padrinho A finaliza.

-----

## 4. Especificação Técnica da Interface (gRPC)

A comunicação entre padrinhos deve ser extremamente rápida e leve. Abaixo, a definição sugerida do serviço em `Protobuf`.

```protobuf
syntax = "proto3";

package core.rpc;

service SponsorService {
  // Chamado pelo Padrinho Orquestrador para ler o estado atual
  // de chaves geridas por outro Padrinho.
  rpc GetCurrentState (StateRequest) returns (StateResponse);

  // (Opcional) Chamado para simular uma execução parcial e reservar
  // o estado resultante por um curto período.
  rpc SimulateAndReserve (SimulationRequest) returns (SimulationResponse);
}

message StateRequest {
  bytes contract_address = 1;
  repeated bytes state_keys = 2; // As chaves de storage que se deseja ler
}

message StateResponse {
  map<string, bytes> values = 1; // Mapa Chave -> Valor Atual
  uint64 current_nonce = 2;      // Para validação de sequência
}

message SimulationRequest {
  bytes caller = 1;
  bytes target_contract = 2;
  bytes call_data = 3;
  uint64 expiry_ms = 4; // Tempo de reserva do Soft Lock
}

message SimulationResponse {
  map<string, bytes> write_set_fragment = 1; // Mudanças geradas nesta sub-chamada
  bytes return_data = 2; // Retorno da função EVM
  bool success = 3;
}
```

-----

## 5. Tratamento de Falhas e Race Conditions

### 5.1. O que acontece se a comunicação falhar?

Se o **Padrinho A** não conseguir contactar o **Padrinho B** (timeout gRPC):

1.  **Fallback de Leitura:** O Padrinho A lê o estado do Contrato B diretamente do seu banco de dados local (último bloco confirmado).
2.  **Risco:** A transação tem uma probabilidade maior de ser rejeitada pelo Minerador se o Padrinho B tiver processado outras transações na memória que ainda não foram para o bloco.
3.  **Mitigação:** O Padrinho A marca a transação com uma flag de `LowConfidence`, alertando o utilizador que a transação pode falhar.

### 5.2. O papel do Minerador no Inter-Padrinhos

É crucial notar que **o Minerador ignora completamente este processo complexo**.

Para o Minerador, a transação final chega assim:

  * **Input:** Assinatura do Usuário (`UserSig`) + Assinatura do Validador (`ValidatorSig`).
  * **Dados:** `ReadSet` e `WriteSet` contendo chaves e valores dos Contratos A (`0x02...A...`) E B (`0x02...B...`).

O Minerador apenas verifica: *"Os valores do `ReadSet` batem com o meu estado atual (DB + transações anteriores neste bloco)?"*. Se sim, aplica o `WriteSet`. A complexidade da coordenação fica 100% na camada de Validação.

-----

## 6. Diagrama de Fluxo de Dados (Exemplo: Swap DEX)

1.  **Usuário**: Monta proposta `Swap(USDT, ETH)`, escolhe Validador=Padrinho Router, assina e envia.
2.  **Padrinho Router** (recebe proposta já assinada):
      * Lê estado local (Taxas, Pool) → adiciona ao `ReadSet`.
      * **gRPC Call** -\> **Padrinho USDT**: *"Qual o saldo de Alice?"*.
          * **Padrinho USDT** retorna saldo, bloqueia chave temporariamente.
          * Padrinho Router adiciona ao `ReadSet` e calcula `WriteSet` (transferência).
      * **gRPC Call** -\> **Padrinho ETH**: *"Qual o saldo da Pool?"*.
          * **Padrinho ETH** retorna saldo, bloqueia chave temporariamente.
          * Padrinho Router adiciona ao `ReadSet` e calcula `WriteSet` (transferência).
3.  **Padrinho Router**:
      * Consolida `ReadSet` (com valores) e `WriteSet` unificados.
      * Assina a transação com `ValidatorSig`.
4.  **Rede P2P**: Transação completa propagada (já contém ambas assinaturas).
5.  **Minerador**: Verifica se `ReadSet` bate com estado atual, aplica `WriteSet`.

-----

## 7. Vantagens desta Abordagem

| Característica | Benefício |
| :--- | :--- |
| **Atomicidade** | A transação ou acontece toda (todos os contratos atualizados) ou nada acontece. Não há estados intermédios inconsistentes. |
| **Performance** | Elimina a necessidade de "Global Lock". Apenas os contratos envolvidos conversam entre si. |
| **Simplicidade de Consenso** | O protocolo de consenso (mineração) permanece leve e agnóstico à lógica de negócio. |
| **Validação Paralela** | Transações são autocontidas (ReadSet com valores) - podem ser validadas em threads isoladas sem acesso a estado externo. |
| **Latência Reduzida** | Fluxo de 2 etapas elimina ida-volta ao usuário durante coordenação inter-padrinhos. |
