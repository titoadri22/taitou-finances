# 💎 Taitou Finances — Control de Finanzas Personales

Aplicación web completa para gestionar tus finanzas personales, construida con Node.js, Express y SQLite.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Express](https://img.shields.io/badge/Express-4.18-blue)
![SQLite](https://img.shields.io/badge/SQLite-3-lightgrey)

## ✨ Características

- **Dashboard** con resumen financiero, gráficos interactivos y tendencias
- **Transacciones** — registra ingresos, gastos y transferencias entre cuentas
- **Múltiples cuentas** — banco, efectivo, tarjeta de crédito, ahorro, inversiones
- **Categorías** personalizables con iconos emoji y colores
- **Presupuestos** mensuales por categoría con barras de progreso
- **Filtros avanzados** por tipo, categoría, cuenta, fechas y búsqueda de texto
- **Exportación CSV** de todas las transacciones
- **Gráficos** — evolución mensual (barras) y distribución de gastos (donut)
- **Diseño responsive** — funciona en móvil, tablet y escritorio
- **Tema oscuro** elegante y profesional

## 🚀 Instalación

```bash
# 1. Entra en la carpeta del proyecto
cd finance-app

# 2. Instala las dependencias
npm install

# 3. Inicia la aplicación
npm start
```

La aplicación estará disponible en **http://localhost:3000**

## 📁 Estructura del Proyecto

```
finance-app/
├── server.js            # Servidor Express
├── package.json
├── db/
│   └── database.js      # Inicialización SQLite y schema
├── routes/
│   └── api.js           # Rutas de la API REST
├── public/
│   ├── index.html       # SPA principal
│   ├── css/
│   │   └── style.css    # Estilos (tema oscuro)
│   └── js/
│       └── app.js       # Lógica del cliente
└── data/
    └── finance.db       # Base de datos (se crea automáticamente)
```

## 🔌 API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/stats` | Estadísticas del dashboard |
| GET | `/api/transactions` | Listar transacciones (paginado, filtros) |
| POST | `/api/transactions` | Crear transacción |
| PUT | `/api/transactions/:id` | Editar transacción |
| DELETE | `/api/transactions/:id` | Eliminar transacción |
| GET | `/api/categories` | Listar categorías |
| POST | `/api/categories` | Crear categoría |
| DELETE | `/api/categories/:id` | Eliminar categoría |
| GET | `/api/accounts` | Listar cuentas con balance |
| POST | `/api/accounts` | Crear cuenta |
| PUT | `/api/accounts/:id` | Editar cuenta |
| DELETE | `/api/accounts/:id` | Eliminar cuenta |
| GET | `/api/budgets` | Listar presupuestos |
| POST | `/api/budgets` | Crear presupuesto |
| DELETE | `/api/budgets/:id` | Eliminar presupuesto |
| GET | `/api/export` | Descargar CSV |

## 🎨 Compatible con Hostinger

Este proyecto usa **Express** (Node.js), que es compatible con Hostinger según sus marcos soportados. Para desplegar:

1. Sube los archivos a tu hosting
2. Configura Node.js en el panel de Hostinger
3. Establece el punto de entrada como `server.js`
4. Asegúrate de que el puerto esté configurado vía variable de entorno `PORT`

## 📝 Notas

- La base de datos SQLite se crea automáticamente en `data/finance.db`
- Las categorías por defecto se insertan en la primera ejecución
- Se crean dos cuentas iniciales: "Cuenta principal" y "Efectivo"
- Los gráficos usan Chart.js cargado desde CDN
