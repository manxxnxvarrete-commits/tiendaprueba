const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.DB_PASSWORD || 'cambia-esta-clave';
const UPLOADS_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

function crearToken(usuario) {
  const payload = Buffer.from(JSON.stringify({
    id: usuario.id_usuario,
    usuario: usuario.usuario,
    tipo: usuario.tipo,
    exp: Date.now() + (1000 * 60 * 60 * 12)
  })).toString('base64url');
  const firma = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${firma}`;
}

function validarToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, firma] = token.split('.');
  const firmaEsperada = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  const firmaValida = Buffer.from(firma).length === Buffer.from(firmaEsperada).length
    && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(firmaEsperada));
  if (!firmaValida) return null;
  try {
    const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return datos.exp > Date.now() ? datos : null;
  } catch {
    return null;
  }
}

function requiereSesion(req, res, next) {
  const usuario = validarToken(req.headers.authorization?.replace('Bearer ', ''));
  if (!usuario) return res.status(401).json({ mensaje: 'Tu sesión expiró. Inicia sesión nuevamente.' });
  req.usuario = usuario;
  next();
}

function requiereAdmin(req, res, next) {
  if (req.usuario.tipo !== 'administrador') {
    return res.status(403).json({ mensaje: 'Esta acción requiere una cuenta de administrador.' });
  }
  next();
}

function productoValido(producto) {
  const { nombre, descripcion = '', precio, stock, imagen = '' } = producto;
  const precioNumero = Number(precio);
  const stockNumero = Number(stock);
  if (!nombre?.trim() || !Number.isFinite(precioNumero) || precioNumero < 0 || !Number.isInteger(stockNumero) || stockNumero < 0) return null;
  return { nombre: nombre.trim(), descripcion: descripcion.trim(), precio: precioNumero, stock: stockNumero, imagen: String(imagen).trim() };
}

function compararTextoSeguro(valor, esperado) {
  const valorBuffer = Buffer.from(String(valor));
  const esperadoBuffer = Buffer.from(String(esperado));
  return valorBuffer.length === esperadoBuffer.length
    && crypto.timingSafeEqual(valorBuffer, esperadoBuffer);
}

async function validarPassword(password, passwordGuardado) {
  if (passwordGuardado.startsWith('$2')) {
    return { correcta: await bcrypt.compare(password || '', passwordGuardado), requiereMigracion: false };
  }

  // Compatibilidad con cuentas antiguas que se guardaron antes de usar bcrypt.
  return { correcta: compararTextoSeguro(password || '', passwordGuardado), requiereMigracion: true };
}

async function crearAdministradorInicial() {
  const usuario = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;
  if (!usuario || !password) return;
  const existe = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(usuario) = LOWER($1)', [usuario]);
  if (existe.rows.length) return;
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query("INSERT INTO usuarios (usuario, password, tipo) VALUES ($1, $2, 'administrador')", [usuario, passwordHash]);
  console.log(`Administrador inicial creado: ${usuario}`);
}

app.get('/', (req, res) => res.send('API de Mi Tienda funcionando'));

app.get('/productos', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM productos ORDER BY id_producto DESC');
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudieron obtener los productos.' });
  }
});

app.post('/registro', async (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario?.trim() || !password || password.length < 4) return res.status(400).json({ mensaje: 'Ingresa un usuario y una contraseña de al menos 4 caracteres.' });
  try {
    const existe = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(usuario) = LOWER($1)', [usuario.trim()]);
    if (existe.rows.length) return res.status(400).json({ mensaje: 'Ese usuario ya existe.' });
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query("INSERT INTO usuarios (usuario, password, tipo) VALUES ($1, $2, 'cliente')", [usuario.trim(), passwordHash]);
    res.status(201).json({ mensaje: 'Cuenta creada. Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudo crear la cuenta.' });
  }
});

app.post('/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const resultado = await pool.query('SELECT * FROM usuarios WHERE LOWER(usuario) = LOWER($1)', [usuario?.trim() || '']);
    if (!resultado.rows.length) return res.status(401).json({ mensaje: 'Usuario o contraseña incorrectos.' });
    const encontrado = resultado.rows[0];
    const verificacion = await validarPassword(password, encontrado.password);
    if (!verificacion.correcta) return res.status(401).json({ mensaje: 'Usuario o contraseña incorrectos.' });

    // Al iniciar sesión correctamente, las contraseñas antiguas se actualizan a bcrypt.
    if (verificacion.requiereMigracion) {
      const passwordHash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE usuarios SET password = $1 WHERE id_usuario = $2', [passwordHash, encontrado.id_usuario]);
    }

    const seguro = { id_usuario: encontrado.id_usuario, usuario: encontrado.usuario, tipo: encontrado.tipo === 'administrador' ? 'administrador' : 'cliente' };
    res.json({ ...seguro, token: crearToken(seguro) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudo iniciar sesión.' });
  }
});

app.post('/uploads', requiereSesion, requiereAdmin, async (req, res) => {
  const { archivo } = req.body;
  const coincidencia = typeof archivo === 'string' && archivo.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!coincidencia) return res.status(400).json({ mensaje: 'Selecciona una imagen PNG, JPG o WebP válida.' });

  const buffer = Buffer.from(coincidencia[2], 'base64');
  if (!buffer.length || buffer.length > 4 * 1024 * 1024) {
    return res.status(400).json({ mensaje: 'La imagen debe pesar menos de 4 MB.' });
  }

  const extension = coincidencia[1] === 'jpeg' ? 'jpg' : coincidencia[1];
  const nombreArchivo = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await fs.promises.writeFile(path.join(UPLOADS_DIR, nombreArchivo), buffer);
  res.status(201).json({ imagen: `/uploads/${nombreArchivo}` });
});

app.post('/productos', requiereSesion, requiereAdmin, async (req, res) => {
  const producto = productoValido(req.body);
  if (!producto) return res.status(400).json({ mensaje: 'Revisa nombre, precio y stock del producto.' });
  try {
    const resultado = await pool.query('INSERT INTO productos (nombre, descripcion, precio, stock, imagen) VALUES ($1, $2, $3, $4, $5) RETURNING *', [producto.nombre, producto.descripcion, producto.precio, producto.stock, producto.imagen]);
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudo crear el producto.' });
  }
});

app.put('/productos/:id', requiereSesion, requiereAdmin, async (req, res) => {
  const producto = productoValido(req.body);
  if (!producto) return res.status(400).json({ mensaje: 'Revisa nombre, precio y stock del producto.' });
  try {
    const resultado = await pool.query('UPDATE productos SET nombre = $1, descripcion = $2, precio = $3, stock = $4, imagen = $5 WHERE id_producto = $6 RETURNING *', [producto.nombre, producto.descripcion, producto.precio, producto.stock, producto.imagen, req.params.id]);
    if (!resultado.rows.length) return res.status(404).json({ mensaje: 'Producto no encontrado.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudo actualizar el producto.' });
  }
});

app.delete('/productos/:id', requiereSesion, requiereAdmin, async (req, res) => {
  try {
    const usado = await pool.query('SELECT 1 FROM detalle_pedido WHERE id_producto = $1 LIMIT 1', [req.params.id]);
    if (usado.rows.length) return res.status(409).json({ mensaje: 'No se puede eliminar un producto que ya tiene pedidos.' });
    const resultado = await pool.query('DELETE FROM productos WHERE id_producto = $1 RETURNING id_producto', [req.params.id]);
    if (!resultado.rows.length) return res.status(404).json({ mensaje: 'Producto no encontrado.' });
    res.json({ mensaje: 'Producto eliminado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudo eliminar el producto.' });
  }
});

app.post('/pedidos', requiereSesion, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ mensaje: 'El carrito está vacío.' });
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const pedido = [];
    let total = 0;
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1) throw new Error('Cantidad inválida.');
      const resultado = await cliente.query('SELECT * FROM productos WHERE id_producto = $1 FOR UPDATE', [item.id_producto]);
      if (!resultado.rows.length) throw new Error('Un producto ya no está disponible.');
      const producto = resultado.rows[0];
      if (producto.stock < cantidad) throw new Error(`${producto.nombre}: stock insuficiente.`);
      pedido.push({ id_producto: producto.id_producto, cantidad, precio: Number(producto.precio) });
      total += Number(producto.precio) * cantidad;
    }
    const nuevoPedido = await cliente.query('INSERT INTO pedidos (id_usuario, fecha, total) VALUES ($1, NOW(), $2) RETURNING *', [req.usuario.id, total]);
    for (const item of pedido) {
      await cliente.query('INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio) VALUES ($1, $2, $3, $4)', [nuevoPedido.rows[0].id_pedido, item.id_producto, item.cantidad, item.precio]);
      await cliente.query('UPDATE productos SET stock = stock - $1 WHERE id_producto = $2', [item.cantidad, item.id_producto]);
    }
    await cliente.query('COMMIT');
    res.status(201).json({ pedido: nuevoPedido.rows[0], mensaje: '¡Compra realizada con éxito!' });
  } catch (error) {
    await cliente.query('ROLLBACK');
    res.status(400).json({ mensaje: error.message || 'No se pudo procesar la compra.' });
  } finally {
    cliente.release();
  }
});

app.get('/pedidos/mis', requiereSesion, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT id_pedido, fecha, total FROM pedidos WHERE id_usuario = $1 ORDER BY fecha DESC', [req.usuario.id]);
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudo consultar el historial.' });
  }
});

app.get('/pedidos', requiereSesion, requiereAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(`SELECT p.id_pedido, p.fecha, p.total, u.usuario, COALESCE(SUM(d.cantidad), 0) AS articulos FROM pedidos p JOIN usuarios u ON u.id_usuario = p.id_usuario LEFT JOIN detalle_pedido d ON d.id_pedido = p.id_pedido GROUP BY p.id_pedido, u.usuario ORDER BY p.fecha DESC`);
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudieron consultar los pedidos.' });
  }
});

async function iniciar() {
  try {
    await crearAdministradorInicial();
    app.listen(PORT, '0.0.0.0', () => console.log(`Servidor funcionando en http://0.0.0.0:${PORT}`));
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error);
    process.exit(1);
  }
}

iniciar();
