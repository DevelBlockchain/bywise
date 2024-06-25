import { StorageMap, StorageList } from 'bywise-utils.js';

function test(name, expected, received) {
    if (expected !== received) throw `Failed test ${name} - expected: "${expected}" - received: "${received}"`
}

const list = new StorageList();

test(1, '0', list.size());

list.push(`Banana-1`);
list.push(`Banana-2`);
list.push(`Banana-3`);

test(2, '3', list.size());
test(3, `Banana-1`, list.get(0));
test(4, `Banana-2`, list.get(1));
test(5, `Banana-3`, list.get(2));

list.set(1, 'Banana-22')
test(2, '3', list.size());
test(3, `Banana-1`, list.get(0));
test(4, `Banana-22`, list.get(1));
test(5, `Banana-3`, list.get(2));

try {
    list.get(-1);
    throw new Error(`Not throw`);
} catch (err) {
    test(6, `BVM: index need be integer number`, err.message);
}

try {
    list.get(10);
    throw new Error(`Not throw`);
} catch (err) {
    test(7, `BVM: index out of array`, err.message);
}

test(8, `Banana-3`, list.pop());
test(9, '2', list.size());

test(10, `Banana-22`, list.pop());
test(11, '1', list.size());

test(12, `Banana-1`, list.pop());
test(13, '0', list.size());

try {
    list.pop();
    throw new Error(`Not throw`);
} catch (err) {
    test(14, `BVM: array is empty`, err.message);
}

const listOfList = new StorageList(); 

listOfList.push(new StorageMap('null'));
test(15, 'null', listOfList.getStorageMap(0).get('asdf'));
listOfList.getStorageMap(0).set('asdf', 'AAAAAA')
test(16, 'AAAAAA', listOfList.getStorageMap(0).get('asdf'));

listOfList.push(new StorageList());
test(17, '0', listOfList.getStorageList(1).size());
listOfList.getStorageList(1).push('AAAAAA')
test(18, '1', listOfList.getStorageList(1).size());