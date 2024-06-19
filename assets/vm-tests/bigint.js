function test(name, expected, received) {
    if (expected !== received) throw `Failed test ${name} - expected: "${expected}" - received: "${received}"`
}

let value = BigInt(10);

value += BigInt(5);
value *= BigInt(2);

test('bigint', '30', value.toString());
