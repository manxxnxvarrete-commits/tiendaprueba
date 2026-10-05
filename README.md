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
