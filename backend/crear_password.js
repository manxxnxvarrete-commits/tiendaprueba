const bcrypt = require('bcrypt');

async function generar() {

    const password = '123456';

    const hash = await bcrypt.hash(password, 10);

    console.log('Contraseña:', password);
    console.log('Hash:', hash);
}

generar();