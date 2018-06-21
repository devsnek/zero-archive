import { assertEqual } from '../common.js';

// env TEST_VAL=42

const key = 'TEST_VAL';

const { getEnv, setEnv, deleteEnv } = environment;

assertEqual(getEnv(key), '42');

setEnv(key, '43');
assertEqual(getEnv(key), '43');

deleteEnv(key);
assertEqual(getEnv(key), undefined);
