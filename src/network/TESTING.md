# Blockchain Synchronization Tests

Este diretório contém testes para a funcionalidade de sincronização da blockchain.

## Estrutura dos Testes

### blockchain_sync_test.go
Testes unitários e de integração para componentes individuais:

- **TestGetLatestCheckpoint**: Testa o handler gRPC para obter informações de checkpoint
- **TestBlockchainSync**: Testa sincronização completa de blockchain entre dois nós
- **TestCheckpointSync**: Testa sincronização usando checkpoints
- **BenchmarkBlockSync**: Benchmark de performance de sincronização

### sync_e2e_test.go
Testes end-to-end que simulam cenários reais:

- **TestE2EFullSync**: Sincronização completa de um nó novo com bootstrap node
- **TestE2ECheckpointSync**: Sincronização usando checkpoints em cenário real
- **TestE2EContinuousSync**: Testa sincronização contínua de novos blocos
- **TestE2EMultipleNodes**: Sincronização com múltiplos bootstrap nodes

## Executando os Testes

### Todos os testes
```bash
go test -v ./src/network/...
```

### Apenas testes rápidos (skip E2E)
```bash
go test -v -short ./src/network/...
```

### Apenas testes de sincronização
```bash
go test -v -run TestBlockchainSync ./src/network/
```

### Apenas testes E2E
```bash
go test -v -run TestE2E ./src/network/
```

### Com cobertura de código
```bash
go test -v -coverprofile=coverage.out ./src/network/
go tool cover -html=coverage.out
```

### Benchmarks
```bash
go test -v -bench=. -benchmem ./src/network/
```

## Cenários de Teste

### 1. Sincronização Básica
Um nó novo sem blockchain se conecta a um bootstrap node e sincroniza todos os blocos.

**Arquivo**: `blockchain_sync_test.go::TestBlockchainSync`

**Fluxo**:
1. Node 1 cria blockchain com N blocos
2. Node 2 inicia sem dados
3. Node 2 conecta ao Node 1
4. Node 2 sincroniza todos os blocos
5. Verifica que ambos têm os mesmos blocos

### 2. Sincronização com Checkpoint
Um nó usa checkpoints para sincronização rápida do estado.

**Arquivo**: `blockchain_sync_test.go::TestCheckpointSync`

**Fluxo**:
1. Cria blockchain com estado
2. Exporta checkpoint para IPFS (mock)
3. Novo storage carrega checkpoint
4. Verifica estado foi restaurado corretamente

### 3. Sincronização E2E Completa
Simula o cenário real de um nó se juntando à rede.

**Arquivo**: `sync_e2e_test.go::TestE2EFullSync`

**Fluxo**:
1. Bootstrap node mina 25 blocos
2. Novo nó inicia e conecta
3. Sincronização automática é executada
4. Verifica integridade de todos os blocos

### 4. Sincronização com Múltiplos Nós
Testa sincronização quando há vários bootstrap nodes com diferentes alturas.

**Arquivo**: `sync_e2e_test.go::TestE2EMultipleNodes`

**Fluxo**:
1. 3 bootstrap nodes com diferentes alturas de blockchain
2. Novo nó conecta a todos os 3
3. Sincroniza com o nó de maior altura
4. Verifica altura correta

### 5. Sincronização Contínua
Testa que novos blocos continuam sendo propagados após sync inicial.

**Arquivo**: `sync_e2e_test.go::TestE2EContinuousSync`

**Fluxo**:
1. Sincronização inicial
2. Bootstrap node mina blocos adicionais
3. Blocos são propagados automaticamente
4. Verifica que novo nó recebe blocos novos

## Cobertura de Teste

Os testes cobrem:

✅ **Protocolos de Rede**
- Handshake entre peers
- Autenticação com tokens
- Rate limiting

✅ **Sincronização de Blocos**
- Download de blocos em lotes
- Validação de blocos
- Aplicação de blocos ao estado

✅ **Checkpoints**
- Criação de checkpoints
- Download de checkpoints via IPFS
- Validação de checkpoints
- Aplicação de estado do checkpoint

✅ **Cenários de Erro**
- Peers desconectam durante sync
- Blocos inválidos
- Checkpoints corrompidos
- Timeouts de rede

✅ **Performance**
- Benchmarks de sincronização
- Uso de memória
- Throughput de blocos

## Debugging de Testes

### Logs Detalhados
```bash
go test -v -run TestE2EFullSync ./src/network/ 2>&1 | tee test.log
```

### Executar um único teste
```bash
go test -v -run TestE2EFullSync/^$ ./src/network/
```

### Com race detector
```bash
go test -v -race ./src/network/
```

### Aumentar timeout
```bash
go test -v -timeout 30m ./src/network/
```

## Troubleshooting

### Testes falham por timeout
- Aumente o timeout: `-timeout 10m`
- Verifique se portas estão disponíveis (19000-19200)
- Execute com `-v` para ver logs detalhados

### "Address already in use"
- Testes estão usando portas fixas para reproduzibilidade
- Aguarde cleanup de testes anteriores
- Ou mude as portas em `setupBootstrapNode()`

### Falha em "nodes failed to connect"
- Verifique se TLS está funcionando
- Confirme que firewall não está bloqueando
- Execute com `GODEBUG=tls13=1` se necessário

### Testes E2E muito lentos
- Execute apenas testes rápidos: `-short`
- Reduza número de blocos nos testes
- Use `-parallel N` para paralelizar

## Métricas de Sucesso

Os testes consideram sucesso quando:

1. **Integridade**: Todos os blocos têm hashes idênticos
2. **Completude**: Altura da blockchain está sincronizada
3. **Performance**: Sync completa em tempo razoável
4. **Robustez**: Recupera de erros de rede
5. **Checkpoints**: Estado é restaurado corretamente

## Próximos Passos

Para expandir a cobertura de testes:

- [ ] Testes de sincronização com reorgs de blockchain
- [ ] Testes de sincronização parcial (range de blocos)
- [ ] Testes de stress com 1000+ blocos
- [ ] Testes com múltiplos checkpoints
- [ ] Testes de latência de rede simulada
- [ ] Testes de largura de banda limitada
- [ ] Testes de failover entre peers
- [ ] Testes de sincronização incremental

## Contribuindo

Ao adicionar novos testes:

1. Adicione documentação clara do cenário
2. Use helpers como `setupBootstrapNode()` para DRY
3. Sempre faça cleanup com `defer`
4. Marque testes lentos com `if testing.Short() { t.Skip() }`
5. Use nomes descritivos: `TestE2E_DescricaoDoCenario`
6. Adicione logs com `t.Logf()` para debugging

## Referências

- [Testing Best Practices](https://github.com/golang/go/wiki/TestComments)
- [Table Driven Tests](https://github.com/golang/go/wiki/TableDrivenTests)
- [Test Fixtures](https://pkg.go.dev/testing)
