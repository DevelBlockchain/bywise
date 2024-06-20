import BywiseUtils, { StorageValue } from 'bywise-utils.js';

class TestContract {
 
    value = new StorageValue('0');
 
    setValue(newValue) {
        this.value.set(newValue);
        return newValue;
    }
 
    getValue() { // @view
        return this.value.get();
    }

    increment(contractAddress) {
        const SC = BywiseUtils.getContract(contractAddress, ['setValue', 'getValue']);
        let value = parseInt(SC.getValue());
        value += 1;
        SC.setValue(value);
        return SC.getValue();
    }
    
    incrementMultipleTimes(contractAddress, times) {
        times = parseInt(times)
        const SC = BywiseUtils.getContract(contractAddress, ['setValue', 'getValue']);
        for (let i = 0; i < times; i++) {
            let value = parseInt(SC.getValue());
            value += 1;
            SC.setValue(value);
        }
        return SC.getValue();
    }

    hardwork(value) {
        value = parseInt(value)
        var count = 0;
        for (let i = 0; i < value; i++) {
            for (let j = 0; j < value; j++) {
                count += i;
            }
        }
        return count;
    }
}
BywiseUtils.exportContract(new TestContract());