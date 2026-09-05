import argon2 from 'argon2';
const hash = await argon2.hash('1234');
console.log(hash);
