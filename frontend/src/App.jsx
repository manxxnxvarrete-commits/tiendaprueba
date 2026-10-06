import { useEffect, useState } from 'react';
import './App.css';

const API_URL = (import.meta.env.VITE_API_URL || 'http://192.168.137.200:3000').replace(/\/$/, '');
const emptyProduct = { nombre: '', descripcion: '', precio: '', stock: '', imagen: '' };
const money = (value) => Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fotoUrl = (imagen) => imagen?.startsWith('/uploads/') ? `${API_URL}${imagen}` : imagen;
const esFoto = (imagen) => Boolean(imagen && (/^https?:\/\//.test(imagen) || imagen.startsWith('/uploads/')));

function App() {
  const [sesion, setSesion] = useState(() => JSON.parse(localStorage.getItem('tienda_sesion') || 'null'));
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState(() => JSON.parse(localStorage.getItem('tienda_carrito') || '[]'));
  const [modo, setModo] = useState('login');
  const [credenciales, setCredenciales] = useState({ usuario: '', password: '' });
  const [mensaje, setMensaje] = useState(null);
  const [verPassword, setVerPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [pedidos, setPedidos] = useState([]);
  const [pestanaAdmin, setPestanaAdmin] = useState('inventario');
  const [productoForm, setProductoForm] = useState(emptyProduct);
  const [editando, setEditando] = useState(null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);

  const notificar = (texto, tipo = 'error') => setMensaje({ texto, tipo });

  const api = async (ruta, opciones = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
    if (sesion?.token) headers.Authorization = `Bearer ${sesion.token}`;
    const respuesta = await fetch(`${API_URL}${ruta}`, { ...opciones, headers });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.mensaje || 'Ocurrió un error en el servidor.');
    return datos;
  };

  const cargarProductos = async () => {
    try {
      const datos = await api('/productos');
      setProductos(datos);
      setCarrito((actual) => actual.map((item) => {
        const actualizado = datos.find((producto) => producto.id_producto === item.id_producto);
        return actualizado ? { ...actualizado, cantidad: Math.min(item.cantidad, actualizado.stock) } : null;
      }).filter(Boolean).filter((item) => item.cantidad > 0));
    } catch (error) {
      notificar(error.message);
    }
  };

  const cargarPedidos = async () => {
    if (!sesion) return;
    try {
      const ruta = sesion.tipo === 'administrador' ? '/pedidos' : '/pedidos/mis';
      setPedidos(await api(ruta));
    } catch (error) {
      if (error.message.includes('sesión')) {
        setSesion(null);
        setCarrito([]);
        notificar('Tu sesión expiró. Inicia sesión nuevamente.', 'info');
      }
    }
  };

  useEffect(() => { cargarProductos(); }, []);
  useEffect(() => { localStorage.setItem('tienda_carrito', JSON.stringify(carrito)); }, [carrito]);
  useEffect(() => {
    if (sesion) {
      localStorage.setItem('tienda_sesion', JSON.stringify(sesion));
      cargarPedidos();
    } else {
      localStorage.removeItem('tienda_sesion');
      setPedidos([]);
    }
  }, [sesion]);

  const cerrarSesion = () => {
    // Borramos primero el almacenamiento para que un refresh no restaure la cuenta.
    localStorage.removeItem('tienda_sesion');
    localStorage.removeItem('tienda_carrito');
    setSesion(null);
    setCarrito([]);
    setPedidos([]);
    setCredenciales({ usuario: '', password: '' });
    setVerPassword(false);
    setModo('login');
    notificar('Sesión cerrada.', 'info');
  };

  const enviarAcceso = async (event) => {
    event.preventDefault();
    setCargando(true);
    setMensaje(null);
    try {
      const ruta = modo === 'login' ? '/login' : '/registro';
      const datos = await api(ruta, { method: 'POST', body: JSON.stringify(credenciales) });
      if (modo === 'registro') {
        setModo('login');
        notificar(datos.mensaje, 'success');
      } else {
        setSesion(datos);
        setCredenciales({ usuario: '', password: '' });
      }
    } catch (error) {
      notificar(error.message);
    } finally {
      setCargando(false);
    }
  };

  const agregar = (producto) => {
    if (producto.stock < 1) return;
    setCarrito((actual) => {
      const existente = actual.find((item) => item.id_producto === producto.id_producto);
      if (existente) {
        if (existente.cantidad >= producto.stock) return actual;
        return actual.map((item) => item.id_producto === producto.id_producto ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...actual, { ...producto, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (id, cambio) => setCarrito((actual) => actual
    .map((item) => item.id_producto === id ? { ...item, cantidad: Math.max(0, Math.min(item.stock, item.cantidad + cambio)) } : item)
    .filter((item) => item.cantidad > 0));

  const finalizarCompra = async () => {
    if (!carrito.length) return;
    setCargando(true);
    try {
      const datos = await api('/pedidos', { method: 'POST', body: JSON.stringify({ items: carrito }) });
      setCarrito([]);
      notificar(`Pedido #${datos.pedido.id_pedido} confirmado. ¡Gracias por tu compra!`, 'success');
      await Promise.all([cargarProductos(), cargarPedidos()]);
    } catch (error) {
      notificar(error.message);
    } finally {
      setCargando(false);
    }
  };

  const guardarProducto = async (event) => {
    event.preventDefault();
    setCargando(true);
    try {
      const ruta = editando ? `/productos/${editando}` : '/productos';
      await api(ruta, { method: editando ? 'PUT' : 'POST', body: JSON.stringify(productoForm) });
      setProductoForm(emptyProduct);
      setEditando(null);
      notificar(editando ? 'Producto actualizado.' : 'Producto agregado al catálogo.', 'success');
      await cargarProductos();
    } catch (error) {
      notificar(error.message);
    } finally {
      setCargando(false);
    }
  };

  const editarProducto = (producto) => {
    setEditando(producto.id_producto);
    setProductoForm({ nombre: producto.nombre, descripcion: producto.descripcion || '', precio: producto.precio, stock: producto.stock, imagen: esFoto(producto.imagen) ? producto.imagen : '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const subirFoto = (event) => {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) return notificar('Usa una imagen JPG, PNG o WebP.');
    if (archivo.size > 4 * 1024 * 1024) return notificar('La imagen debe pesar menos de 4 MB.');

    const lector = new FileReader();
    lector.onload = async () => {
      setSubiendoImagen(true);
      try {
        const datos = await api('/uploads', { method: 'POST', body: JSON.stringify({ archivo: lector.result }) });
        setProductoForm((actual) => ({ ...actual, imagen: datos.imagen }));
        notificar('Foto cargada correctamente.', 'success');
      } catch (error) {
        notificar(error.message);
      } finally {
        setSubiendoImagen(false);
      }
    };
    lector.readAsDataURL(archivo);
  };

  const eliminarProducto = async (producto) => {
    if (!window.confirm(`¿Eliminar “${producto.nombre}”?`)) return;
    try {
      const datos = await api(`/productos/${producto.id_producto}`, { method: 'DELETE' });
      notificar(datos.mensaje, 'success');
      await cargarProductos();
    } catch (error) {
      notificar(error.message);
    }
  };

  const total = carrito.reduce((suma, item) => suma + Number(item.precio) * item.cantidad, 0);
  const piezas = carrito.reduce((suma, item) => suma + item.cantidad, 0);

  if (!sesion) {
    return <div className="auth-page">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <section className="auth-copy">
        <div className="brand"><span className="brand-mark">M</span> MiTienda</div>
        <p className="eyebrow">COMPRAS SIMPLES · VIDA MEJOR</p>
        <h1>Todo lo que buscas, en un solo lugar.</h1>
        <p>Descubre productos seleccionados, compra de forma segura y recibe una experiencia pensada para ti.</p>
        <div className="benefits"><span>✓ Compra segura</span><span>✓ Stock actualizado</span><span>✓ Pedidos reales</span></div>
      </section>
      <main className="auth-card">
        <div className="mobile-brand"><span className="brand-mark">M</span> MiTienda</div>
        <p className="eyebrow">{modo === 'login' ? 'BIENVENIDO DE NUEVO' : 'CREA TU CUENTA'}</p>
        <h2>{modo === 'login' ? 'Inicia sesión' : 'Únete a MiTienda'}</h2>
        <p className="muted">{modo === 'login' ? 'Ingresa tus datos para continuar.' : 'Tus compras comienzan aquí.'}</p>
        <form onSubmit={enviarAcceso} className="stack-form">
          <label>Usuario<input value={credenciales.usuario} onChange={(e) => setCredenciales({ ...credenciales, usuario: e.target.value })} placeholder="Tu usuario" autoComplete="username" required /></label>
          <label>Contraseña<div className="password-input"><input type={verPassword ? 'text' : 'password'} value={credenciales.password} onChange={(e) => setCredenciales({ ...credenciales, password: e.target.value })} placeholder="Tu contraseña" autoComplete={modo === 'login' ? 'current-password' : 'new-password'} minLength="4" required /><button type="button" onClick={() => setVerPassword(!verPassword)} aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{verPassword ? 'Ocultar' : 'Ver'}</button></div></label>
          <button className="primary-btn" disabled={cargando}>{cargando ? 'Un momento…' : modo === 'login' ? 'Entrar a mi cuenta' : 'Crear mi cuenta'}</button>
        </form>
        {mensaje && <p className={`notice ${mensaje.tipo}`}>{mensaje.texto}</p>}
        <p className="switch-auth">{modo === 'login' ? '¿Aún no tienes cuenta?' : '¿Ya tienes una cuenta?'} <button onClick={() => { setModo(modo === 'login' ? 'registro' : 'login'); setMensaje(null); setVerPassword(false); }}>{modo === 'login' ? 'Regístrate' : 'Inicia sesión'}</button></p>
      </main>
    </div>;
  }

  if (sesion.tipo === 'administrador') {
    const ventas = pedidos.reduce((suma, pedido) => suma + Number(pedido.total), 0);
    return <div className="app-shell admin-shell">
      <Header sesion={sesion} salir={cerrarSesion} />
      <main className="admin-main">
        <div className="admin-title"><div><p className="eyebrow">PANEL DE CONTROL</p><h1>Hola, {sesion.usuario}</h1><p>Administra tu tienda desde un solo lugar.</p></div><button className="outline-btn" onClick={cargarProductos}>↻ Actualizar datos</button></div>
        <section className="stats-grid"><Stat icon="▣" label="Productos activos" value={productos.length} /><Stat icon="◫" label="Pedidos recibidos" value={pedidos.length} /><Stat icon="$" label="Ventas registradas" value={money(ventas)} /></section>
        <nav className="tabs"><button className={pestanaAdmin === 'inventario' ? 'active' : ''} onClick={() => setPestanaAdmin('inventario')}>Inventario</button><button className={pestanaAdmin === 'pedidos' ? 'active' : ''} onClick={() => setPestanaAdmin('pedidos')}>Pedidos <span>{pedidos.length}</span></button></nav>
        {mensaje && <p className={`notice page-notice ${mensaje.tipo}`}>{mensaje.texto}</p>}
        {pestanaAdmin === 'inventario' ? <section className="admin-layout">
          <form className="product-form panel" onSubmit={guardarProducto}><div className="panel-heading"><div><p className="eyebrow">{editando ? 'EDICIÓN' : 'NUEVO PRODUCTO'}</p><h2>{editando ? 'Edita el producto' : 'Agrega al catálogo'}</h2></div>{editando && <button type="button" className="text-btn" onClick={() => { setEditando(null); setProductoForm(emptyProduct); }}>Cancelar</button>}</div>
            <label>Nombre<input required value={productoForm.nombre} onChange={(e) => setProductoForm({ ...productoForm, nombre: e.target.value })} placeholder="Ej. Audífonos inalámbricos" /></label>
            <label>Descripción<textarea value={productoForm.descripcion} onChange={(e) => setProductoForm({ ...productoForm, descripcion: e.target.value })} placeholder="Describe tu producto" rows="3" /></label>
            <div className="two-cols"><label>Precio<input required min="0" step="0.01" type="number" value={productoForm.precio} onChange={(e) => setProductoForm({ ...productoForm, precio: e.target.value })} /></label><label>Stock<input required min="0" step="1" type="number" value={productoForm.stock} onChange={(e) => setProductoForm({ ...productoForm, stock: e.target.value })} /></label></div>
            <label>Foto del producto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={subirFoto} disabled={subiendoImagen} /></label>
            <small className="field-help">JPG, PNG o WebP · máximo 4 MB</small>
            {productoForm.imagen && <div className="photo-preview"><FotoProducto imagen={productoForm.imagen} nombre="Vista previa" /><button type="button" onClick={() => setProductoForm({ ...productoForm, imagen: '' })}>Quitar foto</button></div>}
            <button className="primary-btn" disabled={cargando || subiendoImagen}>{subiendoImagen ? 'Subiendo foto…' : editando ? 'Guardar cambios' : 'Publicar producto'}</button>
          </form>
          <section className="panel inventory"><div className="panel-heading"><div><p className="eyebrow">CATÁLOGO</p><h2>Productos publicados</h2></div><span className="count-badge">{productos.length}</span></div><div className="product-admin-list">{productos.map((producto) => <article key={producto.id_producto} className="admin-product"><span className="product-photo-small"><FotoProducto imagen={producto.imagen} nombre={producto.nombre} /></span><div><strong>{producto.nombre}</strong><small>{money(producto.precio)} · {producto.stock} en stock</small></div><div className="row-actions"><button onClick={() => editarProducto(producto)}>Editar</button><button className="danger-text" onClick={() => eliminarProducto(producto)}>Eliminar</button></div></article>)}</div></section>
        </section> : <section className="panel orders"><div className="panel-heading"><div><p className="eyebrow">VENTAS</p><h2>Pedidos recibidos</h2></div></div>{pedidos.length ? <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Artículos</th><th>Fecha</th><th>Total</th></tr></thead><tbody>{pedidos.map((pedido) => <tr key={pedido.id_pedido}><td>#{pedido.id_pedido}</td><td>{pedido.usuario}</td><td>{pedido.articulos}</td><td>{new Date(pedido.fecha).toLocaleDateString('es-MX')}</td><td>{money(pedido.total)}</td></tr>)}</tbody></table></div> : <Empty text="Aún no hay pedidos registrados." />}</section>}
      </main>
    </div>;
  }

  return <div className="app-shell shop-shell">
    <Header sesion={sesion} salir={cerrarSesion} cartCount={piezas} />
    <main className="shop-main">
      <section className="shop-hero"><div><p className="eyebrow">CATÁLOGO DESTACADO</p><h1>Hola, {sesion.usuario}.<br />¿Qué vas a llevar hoy?</h1><p>Productos disponibles, precios claros y una compra sin complicaciones.</p></div><div className="hero-card"><span>🛒</span><strong>{piezas}</strong><small>artículos en tu carrito</small></div></section>
      {mensaje && <p className={`notice page-notice ${mensaje.tipo}`}>{mensaje.texto}</p>}
      <div className="shop-layout"><section><div className="section-heading"><div><h2>Explora la tienda</h2><p>{productos.length} productos disponibles</p></div></div><div className="catalog">{productos.map((producto) => <article className="product-card" key={producto.id_producto}><div className="product-art"><FotoProducto imagen={producto.imagen} nombre={producto.nombre} /><span className={producto.stock ? 'stock' : 'stock sold'}>{producto.stock ? `${producto.stock} disponibles` : 'Agotado'}</span></div><div className="product-body"><h3>{producto.nombre}</h3><p>{producto.descripcion || 'Producto seleccionado para ti.'}</p><div className="product-footer"><strong>{money(producto.precio)}</strong><button disabled={!producto.stock} onClick={() => agregar(producto)}>{producto.stock ? '+ Agregar' : 'Agotado'}</button></div></div></article>)}</div></section>
        <aside className="cart panel"><div className="panel-heading"><div><p className="eyebrow">TU COMPRA</p><h2>Carrito <span className="count-badge">{piezas}</span></h2></div></div>{carrito.length ? <><div className="cart-items">{carrito.map((item) => <div className="cart-item" key={item.id_producto}><span className="cart-photo"><FotoProducto imagen={item.imagen} nombre={item.nombre} /></span><div className="cart-name"><strong>{item.nombre}</strong><small>{money(item.precio)}</small><div className="quantity"><button onClick={() => cambiarCantidad(item.id_producto, -1)}>−</button><b>{item.cantidad}</b><button onClick={() => cambiarCantidad(item.id_producto, 1)}>+</button></div></div><strong>{money(Number(item.precio) * item.cantidad)}</strong></div>)}</div><div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div><button className="primary-btn" disabled={cargando} onClick={finalizarCompra}>{cargando ? 'Procesando…' : 'Finalizar compra'}</button></> : <Empty text="Tu carrito está esperando algo especial." />}</aside>
      </div>
      <section className="panel history"><div className="panel-heading"><div><p className="eyebrow">MI CUENTA</p><h2>Historial de pedidos</h2></div></div>{pedidos.length ? <div className="history-list">{pedidos.map((pedido) => <div key={pedido.id_pedido}><span>Pedido #{pedido.id_pedido}</span><small>{new Date(pedido.fecha).toLocaleDateString('es-MX')}</small><strong>{money(pedido.total)}</strong></div>)}</div> : <Empty text="Tus pedidos aparecerán aquí cuando finalices una compra." />}</section>
    </main>
  </div>;
}

function Header({ sesion, salir, cartCount }) {
  return <header className="topbar"><div className="brand"><span className="brand-mark">M</span> MiTienda</div><div className="user-bar">{cartCount !== undefined && <span className="cart-pill">🛒 {cartCount}</span>}<span className="avatar">{sesion.usuario.slice(0, 1).toUpperCase()}</span><div><strong>{sesion.usuario}</strong><small>{sesion.tipo === 'administrador' ? 'Administrador' : 'Cliente'}</small></div><button type="button" className="logout" onClick={salir} aria-label="Cerrar sesión">Cerrar sesión</button></div></header>;
}

function Stat({ icon, label, value }) { return <article className="stat"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>; }
function Empty({ text }) { return <p className="empty">{text}</p>; }
function FotoProducto({ imagen, nombre }) {
  const [fallo, setFallo] = useState(false);
  if (!esFoto(imagen) || fallo) return <span className="no-photo">Sin foto</span>;
  return <img src={fotoUrl(imagen)} alt={nombre} onError={() => setFallo(true)} />;
}

export default App;
