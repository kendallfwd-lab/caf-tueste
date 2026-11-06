# Tueste V2 — comercio de café + operaciones + growth rentable (caso académico)

Proyecto full stack Next/Vinext desplegable como Cloudflare Worker en Sites, con interfaz React, rutas API, autenticación gestionada por ChatGPT Sites y base de datos SQLite D1 normalizada a 3FN.

## Objetivo

Resolver el caso **Tueste** de las partes 1 y 2 sin confundir ventas atribuidas de Meta con contribución; rediseñar el programa de referidos para activarlo **al llegar y probar el café**; ofrecer una experiencia móvil de tienda y un tablero económico para Diego.

## Rutas

- `/`: tienda, catálogo dinámico, carrito, solicitudes pendientes de pago y simulación de pedido, con parámetro `?ref=TUE-XXXXXXXX`.
- `/pedidos`: historial privado y estados por cliente.
- `/admin`: back office restringido a los correos configurados en `TUESTE_ADMIN_EMAILS`. Permite inventario, fichas, CRM mínimo, verificaciones manuales y estados de fulfillment.
- `/dashboard`: análisis financiero, embudo, recompensas, simulador 24 meses y plan de 90 días.
- `GET/POST /api/referrals`: consultar/crear enlace personal y consultar recompensas.
- `POST /api/orders`: `mode=demo` para simulación académica, o `mode=request` para registrar una solicitud **sin cobrar**. El precio se recalcula del catálogo de D1 y se comprueba disponibilidad.
- `GET /api/catalog`: leer productos activos y existencias del back office.
- `GET/POST /api/admin`: consultas y mutaciones administrativas, autorizadas del lado del servidor (sembrar catálogo explícitamente, actualizar fichas, ajuste auditado de existencias, validar pagos externos comprobados y avanzar estados).
- `POST /api/events`: eventos de medición consentida.
- `GET /api/metrics`: contadores agregados de la demo.

## Arranque

```bash
npm install
npm run db:generate
npm run build
```

Para desarrollo con D1: generar/build y aplicar `drizzle/0000_overrated_menace.sql` y luego `drizzle/0001_youthful_dragon_lord.sql` al SQLite D1 local según las instrucciones del starter. El despliegue del Site aplica migraciones de esquema automáticamente. Ejecutar pruebas numéricas con:

```bash
node --experimental-strip-types --test tests/finance.test.mjs
```

## Arranque administrativo (después del despliegue)

1. Configurar `TUESTE_ADMIN_EMAILS` en los secretos/variables del Site con los correos autorizados. No introducir esos correos en código.
2. Entrar a `/admin` con la cuenta autorizada y hacer clic en «Crear catálogo del caso». Esta acción crea **tres productos con stock 0 y costos desconocidos**; nunca inventa unidades o márgenes.
3. Cargar existencias reales desde «Ajustar stock», documentar su motivo y completar el costo variable de cada producto.
4. Los clientes pueden crear solicitudes sin cobro. El administrador puede verificar manualmente un pago **hecho fuera de la web** con su referencia, descontar inventario y cambiar el estado `pendiente → pagado → preparación → despacho → entregado`.
5. No marcar un pago como verificado sin comprobarlo previamente en el banco o proveedor. No se guardan números de tarjeta.

## Seguridad y estado comercial

- La API exige identidad autenticada y calcula precios/descuentos en el servidor. No acepta importes del navegador. Las operaciones administrativas también requieren correo en allowlist y verificación de origen.
- Las nuevas tablas incluyen `products`, `stock_movements`, `payment_records`, `order_status_events`, separadas de clientes/pedidos/ítems y con claves/índices. Los pedidos conservan snapshot histórico de precio y costo variable si se conoce.
- Los movimientos de inventario no pueden dejar stock negativo. Las verificaciones de pago se registran una sola vez por pedido y referencia, dentro de una transacción con descuento de stock y premios.
- La restricción `UNIQUE` de comprador referido evita acreditar dos veces una misma identidad; las escrituras de pedido y recompensas se ejecutan en una transacción por `DB.batch`. Hay idempotencia por identificador de pedido.
- Los eventos de analítica requieren consentimiento del navegador; no se cargan plataformas de anuncios.
- **No hay pasarela de pago ni cobros en línea**. La verificación manual se basa en un comprobante externo que el operador debe contrastar de forma independiente. El flujo logístico registra estados pero no compra etiquetas, calcula tarifas, factura ni envía correos; las suscripciones no se renuevan automáticamente.
- Antes de vender al público: elegir un proveedor disponible para el **país legal de la empresa**, integrar cobro + webhook verificado, datos de envío, impuestos, antifraude, política de devolución, correo transaccional y despacho, y cambiar acceso del Site a la audiencia que el dueño autorice. Un Site privado no sirve como tienda pública.
- Tueste sigue siendo un **caso educativo ficticio**. Los pedidos comerciales requieren un entorno operativo real y consentimiento del dueño antes de cobrar.
- El caso es ficticio y las imágenes promocionales son conceptuales; no inventamos productores específicos ni certificaciones.

## Entidades 3FN

`customers` → `orders` → `order_items`; `products` → `stock_movements`; `orders` → `payment_records` y `order_status_events`; `customers` → `referral_codes` → `referrals` → `rewards`; `events` para métricas de interacción consentida. Precios unitarios y costos conocidos del pedido permanecen como snapshots históricos y no se recalculan desde catálogo en reportes.

## Variables y trazabilidad

Las cifras observadas del caso se centralizan en `lib/finance.ts`; precios de demo en `lib/catalog.ts`. El modelo de 24 meses declara sus simplificaciones y no es una predicción garantizada. El informe de negocio está incluido como documento separado del código.

La fotografía editorial `public/tueste-editorial-v2.png` es una representación generada por IA para esta web, no una fotografía documental del inventario real.
