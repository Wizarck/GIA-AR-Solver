# Despliegue en VPS — POC web

El POC es un sitio estático servido por Caddy con **HTTPS automático**
(Let's Encrypt). HTTPS es obligatorio: los navegadores solo exponen la
cámara (`getUserMedia`) en contextos seguros.

## Requisitos

- Una VPS con Docker + Docker Compose v2.
- Un dominio (o subdominio) con registro **A/AAAA** apuntando a la IP de la VPS.
- Puertos 80 y 443 abiertos.

## Pasos

```bash
# 1. clona el repo en la VPS
git clone https://github.com/Wizarck/GIA-AR-Solver.git
cd GIA-AR-Solver

# 2. configura tu dominio
echo 'DOMAIN=gia.tudominio.com' > deploy/.env

# 3. levanta
docker compose -f deploy/docker-compose.yml up -d --build

# 4. comprueba
curl -I https://gia.tudominio.com
```

Caddy emite y renueva el certificado TLS automáticamente al primer arranque.

## Probar

1. Abre `https://gia.tudominio.com` en el navegador del PC: usa la webcam
   apuntando a un monitor con la práctica GIA abierta.
2. En el móvil: abre la misma URL; se pedirá permiso de cámara y se usará la
   trasera por defecto (botón "Cambiar cámara" para alternar).

## Qué hace el POC (MVP-1)

- Vista previa de cámara en vivo con overlay: el cuadrilátero verde delimita
  la pantalla detectada (umbral Otsu + componente conexo dominante + esquinas
  extremas + suavizado temporal para que no parpadee).
- Panel "Pantalla rectificada": corrección de perspectiva por homografía
  (DLT de 4 puntos + warp inverso bilineal). Ese es el espacio de coordenadas
  donde correrán los solvers (GIA-013+).
- HUD con FPS y confianza de detección.

## Desarrollo local

```bash
cd web
npm install
npm run dev        # http://localhost:5173 — la cámara funciona en localhost
```

## Privacidad

Todo el procesamiento es local en el navegador; ningún fotograma se envía al
servidor (master prompt §24).
