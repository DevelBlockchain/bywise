import { workerData } from 'worker_threads';
import Bywise from './bywise';

const run = async () => {
    await Bywise.newBywiseInstance(workerData.bywiseStartNodeConfig);
}
run();