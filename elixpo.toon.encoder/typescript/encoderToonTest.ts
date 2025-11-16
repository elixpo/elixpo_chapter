import { encodeValue } from './encode/encoders.ts';
import users from './dummy_w_nest.json' assert { type: 'json' };
const encoded = encodeValue((users), { 
    indent: 2, 
    delimiter: ',', 
    lengthMarker: '#' 
});

console.log('Original Input:');
console.log(users);
console.log('Encoded Output:');
console.log(encoded);
