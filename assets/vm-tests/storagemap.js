import { StorageValue, StorageMap, StorageList } from 'bywise-utils.js';

function test(name, expected, received) {
    if(expected !== received) throw new Error(`Failed test ${name} - expected: "${expected}" - received: "${received}"`)
}

const map = new StorageMap('Banana');

test(1, false, map.has('asdf'));
test(2, 'Banana', map.get('asdf'));

map.set('asdf-asdf', 'XXXXXX');
map.set('asdf-', 'XXXXXX');
map.set('asdfasdf', 'XXXXXX');
test(3, false, map.has('asdf'));
test(4, 'Banana', map.get('asdf'));

map.set('asdf', 'YYYYYY');
test(5, true, map.has('asdf'));
test(6, 'YYYYYY', map.get('asdf'));

map.set('asdf', 'ZZZZZ');
test(7, true, map.has('asdf'));
test(8, 'ZZZZZ', map.get('asdf'));

map.del('asdf');
test(9, false, map.has('asdf'));
test(10, 'Banana', map.get('asdf'));

const mapOfmap = new StorageMap(); 

mapOfmap.set('map', new StorageMap('null'));
test(11, 'null', mapOfmap.getStorageMap('map').get('asdf'));
mapOfmap.getStorageMap('map').set('asdf', 'AAAAAA')
test(12, 'AAAAAA', mapOfmap.getStorageMap('map').get('asdf'));

mapOfmap.set('list', new StorageList());
test(13, '0', mapOfmap.getStorageList('list').size());
mapOfmap.getStorageList('list').push('AAAAAA')
test(14, '1', mapOfmap.getStorageList('list').size());