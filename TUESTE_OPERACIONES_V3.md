# Tueste Café · Operación y cobros de prueba (Costa Rica)

Fecha: 6 de noviembre de 2026 · Responsable del proyecto: Bernny Dumani Vásquez.

## Estado real del sistema

- Sitio privado (solo propietario). Sin cargos reales, sin claves ONVO instaladas y sin cobros automáticos activados.
- Las solicitudes recogen los datos mínimos de entrega en Costa Rica; un pedido no genera envío, factura electrónica ni cargo al crearse.
- Catálogo y cálculo heredados del caso académico están en **USD**. **No se convirtió a colones ni se inventaron tasas, costos, tarifas de entrega ni impuestos.** Antes de vender hay que configurar una lista de precios final con condiciones de envío reales.
- El Club Tueste es solo un producto de cobro **único** en este flujo; no se han habilitado renovaciones ni débitos recurrentes.
- ONVO usa exclusivamente `onvo_test_secret_key_...`; una clave `onvo_live_secret_key_...` o `TUESTE_ONVO_MODE=live` **no permite efectuar cobros** desde este código.

## Por qué ONVO

Se eligió ONVO Pay por documentación oficial de checkout alojado, API en modo de pruebas y webhooks con firma HMAC. Esto minimiza el manejo de información sensible de tarjetas en Tueste. También se estudiaron Tilopay y la alternativa bancaria BAC, que requieren evaluación contractual y validación técnica antes de elegir definitivamente al proveedor del negocio.

Documentación oficial:

- [Checkout ONVO](https://docs.onvopay.com/checkout/one-time-links)
- [Webhooks y reintentos](https://docs.onvopay.com/webhooks)
- [Firma de webhooks](https://docs.onvopay.com/webhooks/verify-signatures)
- [Obtener sesión de Checkout por API](https://docs.onvopay.com/api/obtener-una-sesion-de-checkout)

## Configuración que debe hacer la persona propietaria (sin activar producción)

1. Crear/verificar cuenta de comercio en ONVO y sus condiciones de operación en Costa Rica. Confirmar moneda de cobro, liquidación bancaria, costos, devoluciones y medios de pago habilitados.
2. Obtener una **clave secreta de prueba** `onvo_test_secret_key_...` en ONVO. Configurar como secreto de servidor `ONVO_SECRET_KEY`; no colocarla en `NEXT_PUBLIC_`, Git o frontend.
3. Establecer variable de servidor `TUESTE_ONVO_MODE=test` para permitir solo sesiones de prueba. Sin ambas condiciones, el endpoint devuelve 503 y la UI indica que está desactivado.
4. Hacer una solicitud desde el carrito. En «Mis pedidos», abrir ONVO prueba o consultar «Verificar prueba». Solo `paymentStatus=paid` confirmado por ONVO junto a pedido/monto/moneda/sesión habilita marcarlo `test_paid`.
5. Si se desea usar webhook, ONVO entrega un secreto `whsec_...` que debe guardarse como `ONVO_WEBHOOK_SECRET`. Suscribir únicamente a `checkout_session.succeeded` y configurar `POST /api/payments/webhook` en la URL **pública HTTPS**. **En el Site privado actual el sistema externo no puede entrar: no activar webhooks ahí.** La comprobación directa `/api/payments/confirm` permite ensayar sin cambiar el público.
6. Para cobros reales se necesita autorización expresa adicional, credenciales *live* y una implementación posterior con pruebas de extremo a extremo, términos de venta, moneda/IVA, fiscalidad, reembolsos y logística verificados. Nunca se activa de forma implícita.

## Operación y protección

| Necesidad | Implementación | Precaución |
| --- | --- | --- |
| Creación del pedido | API autentificada + origen verificado + idempotencia + importes cotizados por el servidor | No acepta precio enviado por navegador |
| Domicilio | Provincia, cantón, distrito, teléfono y señas; tabla separada `order_fulfillment` | Solo administración y propietario ven sus datos |
| Checkout | Sesión única por orden, monto congelado, metadatos `orderId`, HTTPS ONVO | Modo `test` solamente; fallo ambiguo requiere revisión, no creación repetitiva |
| Confirmación | Consulta directa a ONVO o webhook firmado; coteja sesión, pedido, moneda, monto, `paid` | Nunca se confía en la URL de retorno del navegador |
| Webhook | HMAC SHA-256 sobre bytes crudos, tolerancia 300 s, varios `v1`, ID estable, transacción SQL | Portal privado bloquea entregas externas |
| Contabilidad | `test_paid` separado de `paid`; ONVO test no acredita ventas ni descuenta stock | No confundir pruebas con ingresos |
| Pagos externos manuales | Solo administrador, con referencia única; prohíbe doble vía con sesión ONVO | El humano debe cotejar con el banco |
| Falta de stock | Pago manual recibido queda `paid_review`, sin restar stock negativo; resolver desde Admin tras reponer | No despachar hasta conciliar |
| Seguimiento | `pending_payment → paid → preparing → shipped → delivered`, con historial | No se factura ni notifica automáticamente |

## Riesgos y decisiones pendientes

- **Moneda y precios:** fijar precios de venta CRC o USD aprobados por la cafetería; la cifra `3400` es US$34.00, no ₡3.400. No convertir por cambio estimado.
- **Costos de última milla:** proveedor logístico, cobertura, tarifas, tiempos reales, política de devoluciones y riesgo de merma.
- **Comisiones reales:** obtener cotización comercial de ONVO y contrastarla con Tilopay/BAC; el panel de margen no incluye automáticamente comisión pasarela, tributos ni logística.
- **Impuestos y facturación electrónica costarricense:** validar con contador/proveedor autorizado antes de cobrar.
- **Privacidad:** domicilio y teléfono son datos personales; definir retención, aviso legal, soporte, supresión y acceso administrativo.
- **Acceso público:** mientras el Site sea privado, los compradores externos no podrán entrar y los webhooks no llegarán. El cambio de audiencia requiere autorización del propietario.
- **Pedidos pendientes antiguos:** los creados antes de esta versión no tienen domicilio, por lo que el operador debe recabarlo antes de despacho.
- **Promoción y referidos:** solo acreditar incentivos en pagos reales verificados; el modo ONVO test nunca regala stock. Auditar margen real y CAC antes de ofrecer cupones.

## Pruebas básicas

```bash
node --test tests/payment-safety.test.mjs
npx tsc --noEmit
npm run build
```

Incluye pruebas de firmas HMAC válidas/alteradas, antigüedad del timestamp, rotación de firmas y datos de entrega. La prueba completa con un checkout ONVO real de sandbox requiere una llave de prueba de la cuenta del negocio. No ejecutar con claves de producción.
