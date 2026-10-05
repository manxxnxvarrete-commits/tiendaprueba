# MiTienda

Tienda web con React/Vite en el frontend y Node.js/Express + PostgreSQL en el backend.

## Estructura

- `frontend/`: interfaz React. Ejecuta `npm run build` para generar `frontend/dist`.
- `backend/`: API de usuarios, productos, pedidos y carga de fotos.

## Desarrollo local

1. Configura `backend/.env` usando `backend/.env.example` como guía.
2. Inicia la API con `cd backend` y `npm start`.
3. Inicia el frontend con `cd frontend` y `npm run dev`.

No subas los archivos `.env`, certificados, llaves privadas, `node_modules`, compilados ni las fotos cargadas por usuarios.

## Despliegue sin servidor propio

### Backend y PostgreSQL en Railway

1. Crea un proyecto Railway desde este repositorio.
2. Agrega PostgreSQL al proyecto y crea un servicio desde la carpeta `backend`.
3. Configura `npm install` como Build Command y `npm start` como Start Command.
4. En las variables del backend configura `DATABASE_URL` con la referencia al `DATABASE_URL` del servicio PostgreSQL, además de `AUTH_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`, `CORS_ORIGIN` y `UPLOADS_DIR=/data/uploads`.
5. Agrega un Volume a la ruta `/data` para conservar las fotos cargadas.

La API creará las tablas automáticamente al iniciar en una base de datos vacía.

### Frontend en Vercel

1. Importa el repositorio en Vercel y define `frontend` como Root Directory.
2. Agrega `VITE_API_URL` con la URL pública HTTPS del backend de Railway.
3. Construye con `npm run build`; el directorio publicado es `dist`.
