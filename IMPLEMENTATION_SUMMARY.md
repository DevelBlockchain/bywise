# Implementação do Novo Fluxo de Transações - Bywise

## Resumo das Mudanças

Esta implementação altera fundamentalmente o fluxo de transações do Bywise, introduzindo duas mempools separadas e um novo processo de validação.

## Mudanças Implementadas

### 1. Duas Mempools Separadas ([miner.go:34-56](src/miner/miner.go#L34-L56))

**Antes:**
- Uma única mempool para transações completas

**Depois:**
- `pendingProposals`: Mempool para proposals assinadas apenas pelo usuário
- `pendingTxs`: Mempool para transações completas (assinadas por usuário + validador)

### 2. Estrutura TransactionProposal ([transaction.go:15-28](src/core/transaction.go#L15-L28))

Nova estrutura no pacote `core` que representa uma proposta de transação assinada pelo usuário:

```go
type TransactionProposal struct {
    TxType     uint8
    Validator  Address
    From       Address
    To         Address
    Value      *BigInt
    Nonce      *BigInt
    BlockLimit uint64
    Data       []byte
    UserSig    []byte
}
```

### 3. Fluxo de Propagação

#### Proposals ([blockchain_server.go:38-58](src/network/blockchain_server.go#L38-L58))
1. Cliente cria e assina proposal
2. Propaga na rede via handler `"proposal"`
3. Todos os nós recebem e adicionam à mempool de proposals
4. Proposals são propagadas automaticamente para outros peers

#### Transactions Completas ([blockchain_server.go:60-80](src/network/blockchain_server.go#L60-L80))
1. Validador processa proposal e gera transação completa
2. Propaga na rede via handler `"transaction"`
3. Todos os nós validam e adicionam à mempool de transactions
4. Transactions são propagadas automaticamente para outros peers

### 4. Processamento de Proposals por Validadores

#### Método de Busca ([miner.go:631-643](src/miner/miner.go#L631-L643))
```go
func (m *Miner) GetProposalsForValidator(validatorAddr core.Address) []*core.TransactionProposal
```

#### Processamento ([validator.go:463-496](src/executor/validator.go#L463-L496))
```go
func (v *Validator) ProcessProposalsFromMempool(
    proposals []*core.TransactionProposal,
    onTransactionSigned func(*core.Transaction),
)
```

**Comportamento:**
- Valida que o proposal é endereçado a este validador
- Executa a transação
- **Se der erro:** Descarta silenciosamente (não propaga)
- **Se sucesso:** Assina e chama callback para propagação

### 5. Validação de Transações Modificada

#### Nova Validação ([miner.go:192-244](src/miner/miner.go#L192-L244))

**Antes:**
- Verificava assinaturas
- Checava nonce único
- Verificava ReadSet contra estado atual

**Depois:**
- Verificava assinaturas
- **NOVO:** Executa com ReadSet e verifica se WriteSet bate
- Verifica ReadSet contra estado atual (única operação de leitura do DB)
- Checa nonce único
- Detecta conflitos

### 6. Validação Stateless

A validação stateless é implementada através de:

1. **ReadSet contém valores** ([miner.go:277-302](src/miner/miner.go#L277-L302))
   - ReadSet armazena tanto chaves quanto valores lidos
   - Permite re-execução sem acessar estado externo

2. **Verificação do WriteSet**
   - Re-executa transação usando apenas ReadSet como entrada
   - Compara WriteSet computado com WriteSet da transação
   - Se baterem, a transação é válida

### 7. Remoção de Acessos Diretos ao Banco

**Princípio:** Movimentações no banco de dados só são válidas se vierem de um bloco através de um WriteSet

#### Único Ponto de Escrita ([miner.go:421-436](src/miner/miner.go#L421-L436))
```go
func (m *Miner) ApplyBlock(block *core.Block) error {
    // Apply all transaction write sets
    for _, tx := range block.Transactions {
        for keyStr, value := range tx.WriteSet {
            key := core.StateKey(keyStr)
            batch.SetState(key, value)
        }
    }
}
```

**Acesso de Leitura Permitido:**
- `verifyPreState`: Lê estado para verificar se ReadSet bate com DB atual
- Esta é a única validação que acessa o banco

**TODO: Remover outros acessos diretos**
- Buscar e remover chamadas diretas a `GetAccount`, `SetAccount`, etc.
- Garantir que todas as operações passem pelo WriteSet

## Novo Fluxo Completo

### Criação e Propagação de Proposal

```
1. Cliente cria proposal
2. Cliente assina (UserSig)
3. Cliente envia para rede
4. Rede propaga proposal para todos os nós
5. Proposal é adicionada à mempool de proposals
```

### Processamento por Validador

```
6. Validador busca proposals do seu endereço
7. Validador executa cada proposal
   - Se erro: descarta silenciosamente
   - Se sucesso: continua
8. Validador gera ReadSet/WriteSet
9. Validador assina (ValidatorSig)
10. Validador propaga transação completa na rede
11. Validador remove proposal da mempool
```

### Validação por Mineradores

```
12. Minerador recebe transação completa
13. Minerador verifica assinaturas
14. Minerador re-executa com ReadSet e verifica WriteSet
15. Minerador verifica se ReadSet bate com estado atual do DB
16. Se tudo OK, adiciona à mempool de transactions
17. Minerador seleciona transações sem conflito
18. Minerador cria bloco
```

### Aplicação de Bloco

```
19. Bloco é validado por outros nós
20. WriteSet de cada transação é aplicado ao estado
21. Esta é a ÚNICA forma de modificar o estado
```

## Callbacks Implementados

### No Miner ([miner.go:611-619](src/miner/miner.go#L611-L619))

```go
SetOnProposalAdded(callback func(*core.TransactionProposal))
SetOnTransactionAdded(callback func(*core.Transaction))
```

Usados para propagar quando novos itens chegam à mempool.

### No Validator ([validator.go:466-468](src/executor/validator.go#L466-L468))

```go
ProcessProposalsFromMempool(
    proposals []*core.TransactionProposal,
    onTransactionSigned func(*core.Transaction),
)
```

Callback chamado quando uma transação é processada com sucesso.

## Próximos Passos

### 1. Integração com Main

Conectar os callbacks no `main.go`:

```go
// Setup callbacks para propagação automática
miner.SetOnProposalAdded(func(p *core.TransactionProposal) {
    blockchainHandler.BroadcastProposal(p)
})

miner.SetOnTransactionAdded(func(tx *core.Transaction) {
    blockchainHandler.BroadcastTransaction(tx)
})

// Setup validator worker loop
if validator != nil {
    go validatorWorkerLoop(validator, miner, blockchainHandler)
}
```

### 2. Atualizar API Endpoints

Modificar endpoints para usar o novo fluxo:
- `/validator/proposal` - enviar proposal
- `/blockchain/tx/submit` - enviar proposal (não transação completa)

### 3. Remover Acessos Diretos ao Banco

Buscar e remover:
- Chamadas a `GetAccount()` fora do contexto de leitura para validação
- Chamadas a `SetAccount()` fora do ApplyBlock
- Outras operações que modificam estado diretamente

### 4. Implementar Sequence ID

Implementar tracking de `sequenceID` por validador para manter ordem em contratos patrocinados.

### 5. Testes

Adicionar testes para:
- Propagação de proposals
- Processamento por validadores
- Validação stateless
- Rejeição de transações inválidas
- Fluxo completo end-to-end

## Arquivos Modificados

1. `src/core/transaction.go` - Adicionada estrutura TransactionProposal
2. `src/miner/miner.go` - Duas mempools, novos métodos de validação
3. `src/executor/validator.go` - ProcessProposal modificado, worker method
4. `src/network/blockchain_server.go` - Handlers e broadcast de proposals/transactions

## Benefícios da Nova Arquitetura

1. **Separação clara de responsabilidades**
   - Usuários criam proposals
   - Validadores executam e assinam
   - Mineradores selecionam e mineram
   - Rede propaga em dois estágios

2. **Validação stateless**
   - ReadSet contém valores
   - Permite validação sem acessar estado externo
   - Facilita paralelização

3. **Controle de estado rigoroso**
   - Única fonte de verdade: WriteSet de blocos
   - Elimina condições de corrida
   - Garante consistência

4. **Resiliência a falhas**
   - Proposals inválidas são descartadas silenciosamente
   - Não poluem a mempool de transactions
   - Validadores não propagam lixo

5. **Transparência**
   - Duas mempools claramente separadas
   - Fácil auditoria do fluxo
   - Debug simplificado
