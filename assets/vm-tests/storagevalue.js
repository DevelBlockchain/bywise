import { StorageValue, StorageMap, StorageList } from 'bywise-utils.js';

function test(name, expected, received) {
    if (expected !== received) throw new Error(`Failed test ${name} - expected: "${expected}" - received: "${received}"`)
}

const value = new StorageValue();

test(1, '', value.get());
value.set('Banana');
test(2, 'Banana', value.get());

const valueOfMap = new StorageValue(); 

valueOfMap.set(new StorageMap('null'));
test(15, 'null', valueOfMap.getStorageMap().get('asdf'));
valueOfMap.getStorageMap().set('asdf', 'AAAAAA')
test(16, 'AAAAAA', valueOfMap.getStorageMap().get('asdf'));

valueOfMap.set(new StorageList());
test(17, '0', valueOfMap.getStorageList().size());
valueOfMap.getStorageList().push('AAAAAA')
test(18, '1', valueOfMap.getStorageList().size());

