import BywiseUtils from 'bywise-utils.js';

class DefaultContract {

    test1(limit) {
        let sum = 0;
        for (let i = 0; i < limit; i++) {
            sum += 1;
        }
        return sum;
    }

    test2(limit) {
        let sum = 0;
        for (let i = 0; i < limit; i++) {
            sum += Math.random()
        }
        return sum;
    }

    test3(limit) {
        if (limit == 1) {
            return 1;
        } else {
            return this.test3(limit - 1) * limit;
        }
    }

    test4(limit) {
        let matrix = [];
        for (let j = 0; j < limit; j++) {
            let row = [];
            for (let i = 0; i < limit; i++) {
                row.push(i)
            }
            matrix.push(row);
        }
    }

}

BywiseUtils.exportContract(new DefaultContract());