const express = require('express');
const router = express.Router();
const pool = require('../database');
const { isLoggedIn } = require('../lib/auth');
const helpers = require('../lib/helpers');
const moment = require('moment-timezone');

router.get('/add', isLoggedIn, (req, res) => {
    res.render('links/add', { script: '' });
});

router.post('/add', isLoggedIn, async (req, res) => {
    const { id, urlimagen, nombre, descripcion, precio, categoria, confirmaciondedisponibilidad } = req.body;

    // Verificar que el campo 'id' no esté vacío
    if (!id) {
        const script = `Swal.fire('Error', 'El campo "Código del producto" no puede estar vacío.', 'error');`;
        return res.render('links/add', { script });
    }

    // Verificar que 'id' sea un número entero
    if (!Number.isInteger(Number(id))) {
        const script = `Swal.fire('Error', 'El campo "Código del producto" debe ser un número entero.', 'error');`;
        return res.render('links/add', { script });
    }

    const existingProduct = await pool.query('SELECT * FROM producto WHERE id = ?', [id]);
    if (existingProduct.length > 0) {
        const script = `Swal.fire('Error', 'Ya existe un producto con el mismo código.', 'error');`;
        return res.render('links/add', { script });
    }

    const isValidText = (text) => /^[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ\s]+$/.test(text);
    if (!isValidText(nombre) || !isValidText(descripcion) || !isValidText(categoria) || !isValidText(confirmaciondedisponibilidad)) {
        const script = `Swal.fire('Error', 'Los campos de texto deben contener solo letras.', 'error');`;
        return res.render('links/add', { script });
    }

    if (!Number.isInteger(Number(precio))) {
        const script = `Swal.fire('Error', 'El precio debe ser un número entero.', 'error');`;
        return res.render('links/add', { script });
    }

    const newProduct = { id, urlimagen, nombre, descripcion, precio, categoria, confirmaciondedisponibilidad };
    await pool.query('INSERT INTO producto SET ?', [newProduct]);
    const script = `Swal.fire('Éxito', 'Producto guardado exitosamente.', 'success');`;
    res.render('links/add', { script });
});

router.get('/', isLoggedIn, async (req, res) => {
    const productos = await pool.query('SELECT * FROM producto');
    res.render('links/list', { productos });
});

router.get('/listUsers', isLoggedIn, async (req, res) => {
    const productos = await pool.query('SELECT * FROM producto');
    res.render('links/listUsers', { productos });
});

router.get('/delete/:id', isLoggedIn, async (req, res) => {
    const { id } = req.params;
    await pool.query('DELETE FROM producto WHERE id = ?', [id]);
    req.flash('success', 'Product Removed Successfully');
    res.redirect('/links');
});

router.get('/edit/:id', isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const productos = await pool.query('SELECT * FROM producto WHERE id = ?', [id]);
    res.render('links/edit', { productos: productos[0] });
});

router.post('/edit/:id', isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const { urlimagen, nombre, descripcion, precio, categoria, confirmaciondedisponibilidad } = req.body;
    const updatedProduct = { urlimagen, nombre, descripcion, precio, categoria, confirmaciondedisponibilidad };
    await pool.query('UPDATE producto SET ? WHERE id = ?', [updatedProduct, id]);
    req.flash('success', 'Product Updated Successfully');
    res.redirect('/links');
});

// Agregar producto al carrito
router.post('/cart/add/:id', isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const producto = await pool.query('SELECT * FROM producto WHERE id = ?', [id]);

    if (producto.length > 0) {
        const item = producto[0];
        if (!req.session.cart) {
            req.session.cart = [];
        }

        const cartIndex = req.session.cart.findIndex(p => p.id === id);
        if (cartIndex > -1) {
            req.session.cart[cartIndex].cantidad++;
        } else {
            item.cantidad = 1;
            req.session.cart.push({ ...item, cartId: Date.now() });
        }

        res.json({ success: true, message: 'Product added to cart successfully!' });
    } else {
        res.json({ success: false, message: 'Product not found' });
    }
});

// Mostrar carrito
router.get('/cart', isLoggedIn, async (req, res) => {
    const direcciones = await pool.query('SELECT * FROM direcciones WHERE id_cliente = ?', [req.user.id]);
    res.render('links/cart', { cart: req.session.cart, direcciones });
});

router.post('/cart/delete/:cartId', isLoggedIn, (req, res) => {
    const { cartId } = req.params;
    const cartIndex = req.session.cart.findIndex(item => item.cartId == cartId);
    if (cartIndex > -1) {
        req.session.cart.splice(cartIndex, 1);
        res.json({ success: true, message: 'El producto ha sido eliminado correctamente.' });
    } else {
        res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }
});

router.post('/cart/update-qty/:cartId', isLoggedIn, (req, res) => {
    const { cartId } = req.params;
    const { cantidad } = req.body;

    const cartIndex = req.session.cart.findIndex(item => item.cartId == cartId);
    if (cartIndex > -1) {
        req.session.cart[cartIndex].cantidad = cantidad;
        res.json({ success: true, message: 'Cantidad actualizada correctamente.' });
    } else {
        res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }
});

// Guardar nueva dirección
router.post('/addDireccion', isLoggedIn, async (req, res) => {
    const { direccion } = req.body;
    const id_cliente = req.user.id;

    try {
        // Verificar si el cliente existe en la tabla cliente
        const clienteResult = await pool.query('SELECT * FROM cliente WHERE id = ?', [id_cliente]);
        if (clienteResult.length === 0) {
            // Insertar el cliente en la tabla cliente si no existe
            await pool.query('INSERT INTO cliente (id, nombre, apellido) VALUES (?, ?, ?)', [id_cliente, req.user.username, '']);
        }

        // Verificar si la dirección ya existe para este usuario
        const existingDireccion = await pool.query('SELECT * FROM direcciones WHERE direccionCliente = ? AND id_cliente = ?', [direccion, id_cliente]);
        if (existingDireccion.length > 0) {
            return res.json({ success: false, message: 'Esta dirección ya existe.' });
        }

        // Insertar la nueva dirección en la base de datos
        await pool.query('INSERT INTO direcciones (direccionCliente, id_cliente) VALUES (?, ?)', [direccion, id_cliente]);
        res.json({ success: true, message: 'Dirección guardada con éxito.' });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'No se pudo guardar la dirección.' });
    }
});

router.post('/cart/checkout', isLoggedIn, async (req, res) => {
    const user = req.user;
    if (!user) {
        return res.json({ success: false, message: 'Usuario no autenticado.' });
    }

    const { id: id_usuario } = user;
    const { deliveryOption, direccionId, nombre_completo, telefono } = req.body;
    console.log(nombre_completo, telefono)
    if (!req.session.cart || req.session.cart.length === 0) {
        return res.json({ success: false, message: 'El carrito está vacío.' });
    }

    try {
        // Verificar si el usuario está en la tabla cliente
        const clienteResult = await pool.query('SELECT * FROM cliente WHERE id = ?', [id_usuario]);
        if (clienteResult.length === 0) {
            // Si no está, insertar el usuario en la tabla cliente
            await pool.query('INSERT INTO cliente (id, nombre_completo, telefono) VALUES (?, ?, ?)', [id_usuario, nombre_completo, telefono]);
        }

        const total = req.session.cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
        const fechaCompra = moment().tz('America/Bogota');
        const fechaCompraStr = fechaCompra.format('YYYY-MM-DD');
        const horaCompraStr = fechaCompra.format('HH:mm:ss');

        const result = await pool.query('INSERT INTO compras (id_cliente, fecha_compra, hora_compra, total) VALUES (?, ?, ?, ?)', [id_usuario, fechaCompraStr, horaCompraStr, total]);

        const id_compra = result.insertId;

        for (const item of req.session.cart) {
            await pool.query('INSERT INTO detalle_compra (id_compra, id_producto, cantidad, precio_unitario) VALUES (?, ?, ?, ?)', [id_compra, item.id, item.cantidad, item.precio]);
        }

        // Marcar el pedido como pendiente en la cocina
        await pool.query('INSERT INTO pedidos_cocina (id_compra, estado, Tipo_entrega) VALUES (?, ?, ?)', [id_compra, 'recibido', deliveryOption]);

        req.session.cart = []; // Vaciar el carrito después de la compra
        res.json({ success: true, message: 'Compra realizada con éxito.', roles: user.roles });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'No se pudo realizar la compra.' });
    }
});

router.get('/empleado', isLoggedIn, (req, res) => {
    res.render('links/empleados', { script: '' });
});

router.post('/empleado', isLoggedIn, async (req, res) => {
    const { username, password, roles, nombre_completo, id, telefono, tipo_vehiculo, numero_licencia, fecha_vencimiento_licencia } = req.body;

    const existingUser = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUser.length > 0) {
        const script = `Swal.fire('Error', 'Ya existe un usuario con el mismo nombre de usuario.', 'error');`;
        return res.render('links/empleados', { script });
    }

    const isValidText = (text) => /^[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ\s]+$/.test(text);
    if (!isValidText(username) || !isValidText(roles)) {
        const script = `Swal.fire('Error', 'Los campos de texto deben contener solo letras.', 'error');`;
        return res.render('links/empleados', { script });
    }

    if (password.length < 6) {
        const script = `Swal.fire('Error', 'La contraseña debe tener al menos 6 caracteres.', 'error');`;
        return res.render('links/empleados', { script });
    }

    const encryptedPassword = await helpers.encryptPassword(password)
    const newUser = {
        username,
        password: encryptedPassword,
        id_persona: id,
        roles
    };
    await pool.query('INSERT INTO users SET ?', [newUser]);
    const newEmployee = {
        nombre_completo,
        numero_identificacion: id,
        telefono,
        roles,
        username
    };
    await pool.query('INSERT INTO empleados SET ?', [newEmployee]);
    if (roles === 'domiciliario') {
        const newDomiciliario = {
            numero_identificacion: id,
            medio_transporte: roles === 'domiciliario' ? tipo_vehiculo : null,
            licencia_conduccion: (tipo_vehiculo === 'moto' || tipo_vehiculo === 'carro') ? numero_licencia : null,
            fecha_fin_licencia: (tipo_vehiculo === 'moto' || tipo_vehiculo === 'carro') ? fecha_vencimiento_licencia : null
        };
        await pool.query('INSERT INTO domiciliario SET ?', [newDomiciliario]);
    }

    const script = `Swal.fire('Éxito', 'Empleado guardado exitosamente.', 'success');`;
    res.render('links/empleados', { script });
});

router.get('/domiciliario', isLoggedIn, async (req, res) => {
    res.render('links/domiciliario');
});

// Ruta para mostrar los detalles de la compra asignada al domiciliario
router.get('/domiciliario/:id', isLoggedIn, async (req, res) => {
    const { id: id_domiciliario } = req.params;
    try {
        // Obtener el id_compra desde la tabla domicilios
        const compraResult = await pool.query(`
            SELECT id_compra, id as id_domicilio 
            FROM domicilios
            WHERE id_domiciliario = ? AND fecha_entrega IS NULL
        `, [id_domiciliario]);

        console.log('Compra Result:', compraResult); // Agregar este log

        if (compraResult.length === 0) {
            return res.render('links/domiciliario', { message: 'No tienes asignaciones pendientes.' });
        }

        const id_compra = compraResult[0].id_compra;
        const id_domicilio = compraResult[0].id_domicilio;

        // Obtener información de los productos que debe llevar el domiciliario
        const productosResult = await pool.query(`
            SELECT producto.id, producto.nombre, detalle_compra.cantidad, producto.urlimagen, ? as id_domicilio, ? as id_domiciliario
            FROM domicilios
            JOIN domiciliario ON domicilios.id_domiciliario = domiciliario.id
            JOIN empleados ON empleados.numero_identificacion = domiciliario.numero_identificacion
            JOIN users ON empleados.username = users.username
            JOIN compras ON compras.id = domicilios.id_compra
            JOIN detalle_compra ON compras.id = detalle_compra.id_compra
            JOIN producto ON detalle_compra.id_producto = producto.id
            WHERE domiciliario.id = ? AND domicilios.fecha_entrega IS NULL
        `, [id_domicilio, id_domiciliario, id_domiciliario]);

        console.log('Productos Result:', productosResult); // Agregar este log

        if (productosResult.length === 0) {
            return res.render('links/domiciliario', { message: 'No tienes asignaciones pendientes.' });
        }

        // Obtener la dirección de entrega usando id_compra
        const direccionResult = await pool.query(`
            SELECT direcciones.direccionCliente 
            FROM compras
            JOIN cliente ON cliente.id = compras.id_cliente
            JOIN direcciones ON cliente.id = direcciones.id_cliente
            JOIN domicilios ON domicilios.id_compra = compras.id
            WHERE compras.id = ? AND domicilios.fecha_entrega IS NULL
        `, [id_compra]);

        console.log('Dirección Result:', direccionResult); // Agregar este log

        if (direccionResult.length === 0) {
            return res.render('links/domiciliario', { message: 'No se pudo encontrar la dirección de entrega.' });
        }

        const direccion = direccionResult[0].direccionCliente;

        res.render('links/domiciliario', {
            productos: productosResult,
            direccion,
            id_domicilio,
            id_domiciliario
        });
    } catch (error) {
        console.error(error);
        res.render('links/domiciliario', { message: 'Error al obtener los detalles de la compra.' });
    }
});


router.post('/entregado', isLoggedIn, async (req, res) => {
    const { id_domicilio, id_domiciliario } = req.body;

    // Ajustar la fecha y hora a tu zona horaria local
    const fechaEntrega = moment().tz('America/Bogota'); // Cambia 'America/Bogota' a tu zona horaria local
    const fechaEntregaStr = fechaEntrega.format('YYYY-MM-DD');
    const horaEntregaStr = fechaEntrega.format('HH:mm:ss');


    try {
        // Actualizar la fecha y hora de entrega en la tabla domicilios
        await pool.query(`
            UPDATE domicilios
            SET fecha_entrega = ?, hora_entrega = ?
            WHERE id = ?
        `, [fechaEntregaStr, horaEntregaStr, id_domicilio]);

        // Actualizar el horario disponible y estado en la tabla domiciliario
        await pool.query(`
            UPDATE domiciliario
            SET horario_disponible = ?, estado = 'Si'
            WHERE id = ?
        `, [fechaEntregaStr + ' ' + horaEntregaStr, id_domiciliario]);

        res.json({ success: true, message: 'Entrega registrada correctamente.' });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'No se pudo registrar la entrega.' });
    }
});

router.get('/cocina', isLoggedIn, async (req, res) => {
    try {
        const pedidosResult = await pool.query(`
            SELECT pc.id_compra, p.nombre, dc.cantidad
            FROM pedidos_cocina pc
            JOIN detalle_compra dc ON pc.id_compra = dc.id_compra
            JOIN producto p ON dc.id_producto = p.id
            WHERE pc.estado = 'recibido'
        `);

        const pedidos = pedidosResult.reduce((acc, pedido) => {
            if (!acc[pedido.id_compra]) {
                acc[pedido.id_compra] = { id_compra: pedido.id_compra, productos: [] };
            }
            acc[pedido.id_compra].productos.push({ nombre: pedido.nombre, cantidad: pedido.cantidad });
            return acc;
        }, {});

        res.render('links/cocina', { pedidos: Object.values(pedidos) });
    } catch (error) {
        console.error(error);
        res.render('links/cocina', { message: 'Error al obtener los pedidos.' });
    }
});

router.post('/marcar-pedido-listo', isLoggedIn, async (req, res) => {
    const { id_compra } = req.body;

    try {
        // Obtener el tipo de entrega del pedido
        const tipoEntregaResult = await pool.query('SELECT Tipo_entrega FROM pedidos_cocina WHERE id_compra = ?', [id_compra]);
        const tipoEntrega = tipoEntregaResult[0].Tipo_entrega;

        if (tipoEntrega === 'domicilio') {
            // Verificar si hay domiciliarios disponibles
            const domiciliarioResult = await pool.query(`
                SELECT id
                FROM domiciliario
                WHERE estado = 'Si'
                ORDER BY horario_disponible ASC
                LIMIT 1
            `);

            if (domiciliarioResult.length === 0) {
                return res.json({ success: false, message: 'Domiciliarios no disponibles por el momento.' });
            }

            const id_domiciliario = domiciliarioResult[0].id;

            // Marcar el pedido como listo en la cocina
            await pool.query('UPDATE pedidos_cocina SET estado = ? WHERE id_compra = ?', ['listo', id_compra]);

            // Ajustar la fecha y hora a tu zona horaria local
            const fechaEnvio = moment().tz('America/Bogota');
            const fechaEnvioStr = fechaEnvio.format('YYYY-MM-DD');
            const horaEnvioStr = fechaEnvio.format('HH:mm:ss');

            await pool.query('INSERT INTO domicilios (id_compra, id_domiciliario, fecha_envio, hora_envio) VALUES (?, ?, ?, ?)', [id_compra, id_domiciliario, fechaEnvioStr, horaEnvioStr]);

            // Actualizar estado del domiciliario
            await pool.query('UPDATE domiciliario SET estado = ?, horario_disponible = ? WHERE id = ?', ['No', null, id_domiciliario]);

            res.json({ success: true, message: 'Pedido marcado como listo y domiciliario asignado.' });
        } else if (tipoEntrega === 'tienda') {
            // Marcar el pedido como listo en la cocina
            await pool.query('UPDATE pedidos_cocina SET estado = ? WHERE id_compra = ?', ['listo', id_compra]);

            const fechaFinPreparacion = moment().tz('America/Bogota');
            const fechaFinPreparacionStr = fechaFinPreparacion.format('YYYY-MM-DD');
            const horaFinPreparacionStr = fechaFinPreparacion.format('HH:mm:ss');

            await pool.query('INSERT INTO recogida_en_tienda (id_compra, fecha_fin_preparación, hora_fin_preparación, fecha_recogida, hora_recogida) VALUES (?, ?, ?, ?, ?)', 
            [id_compra, fechaFinPreparacionStr, horaFinPreparacionStr, null, null]);

            res.json({ success: true, message: 'Pedido marcado como listo para recogida en tienda.' });
        } else {
            res.json({ success: false, message: 'Tipo de entrega no reconocido.' });
        }
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'No se pudo marcar el pedido como listo.' });
    }
});




router.get('/cocina', isLoggedIn, async (req, res) => {
    res.render('links/cocina')
})


// Ruta para consultar el estado de los pedidos
router.get('/consulta-pedido', isLoggedIn, async (req, res) => {
    try {
        const id_cliente = req.user.id;

        // Obtener todas las compras del cliente
        const comprasResult = await pool.query(`
            SELECT compras.id, compras.fecha_compra, compras.hora_compra, compras.total, 
            pedidos_cocina.estado as estado_cocina, domicilios.fecha_envio, domicilios.fecha_entrega
            FROM compras
            LEFT JOIN pedidos_cocina ON compras.id = pedidos_cocina.id_compra
            LEFT JOIN domicilios ON compras.id = domicilios.id_compra
            WHERE compras.id_cliente = ?
            ORDER BY compras.fecha_compra DESC, compras.hora_compra DESC
        `, [id_cliente]);

        if (comprasResult.length === 0) {
            return res.render('links/consultarPedido', { pedidos: [] });
        }

        const pedidos = await Promise.all(comprasResult.map(async compra => {
            let estado_recibido = false;
            let estado_preparado = false;
            let estado_enviado = false;
            let estado_entregado = false;

            if (compra.estado_cocina === 'recibido' || compra.estado_cocina === 'listo') {
                estado_recibido = true;
            }

            if (compra.estado_cocina === 'listo') {
                estado_preparado = true;
            }

            if (compra.fecha_entrega) {
                estado_entregado = true;
                estado_enviado = true;
                estado_preparado = true;
                estado_recibido = true;
            } else if (compra.fecha_envio) {
                estado_enviado = true;
                estado_preparado = true;
                estado_recibido = true;
            }
                        // Formatear la fecha de compra
            const fecha_compra = new Date(compra.fecha_compra).toLocaleDateString('es-CO', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });

            // Obtener los productos de la compra
            const productosResult = await pool.query(`
                SELECT producto.nombre, detalle_compra.cantidad
                FROM detalle_compra
                JOIN producto ON detalle_compra.id_producto = producto.id
                WHERE detalle_compra.id_compra = ?
            `, [compra.id]);
            return {
                id: compra.id,
                estado_recibido,
                estado_preparado,
                estado_enviado,
                estado_entregado,
                fecha_compra,
                hora_compra: compra.hora_compra,
                total: compra.total,
                productos: productosResult
            };
        }));

        res.render('links/consultarPedido', { pedidos });
    } catch (error) {
        console.error(error);
        res.render('links/consultarPedido', { pedidos: [], message: 'Error al obtener el estado de los pedidos.' });
    }
});



router.get('/caja', isLoggedIn, async (req, res) => {
    try {
        const pedidosTiendaResult = await pool.query(`
            SELECT rt.id_compra, p.nombre, dc.cantidad
            FROM recogida_en_tienda rt
            JOIN detalle_compra dc ON rt.id_compra = dc.id_compra
            JOIN producto p ON dc.id_producto = p.id
            WHERE rt.fecha_recogida IS NULL
        `);

        const pedidosTienda = pedidosTiendaResult.reduce((acc, pedido) => {
            if (!acc[pedido.id_compra]) {
                acc[pedido.id_compra] = { id_compra: pedido.id_compra, productos: [] };
            }
            acc[pedido.id_compra].productos.push({ nombre: pedido.nombre, cantidad: pedido.cantidad });
            return acc;
        }, {});

        res.render('links/caja', { pedidos: Object.values(pedidosTienda) });
    } catch (error) {
        console.error(error);
        res.render('links/caja', { message: 'Error al obtener los pedidos para recoger en tienda.' });
    }
});

router.post('/marcar-pedido-entregado', isLoggedIn, async (req, res) => {
    const { id_compra } = req.body;

    try {
        // Obtener la fecha y hora actuales en la zona horaria de Bogotá
        const fechaActual = moment.tz('America/Bogota');
        const fechaRecogidaStr = fechaActual.format('YYYY-MM-DD');
        const horaRecogidaStr = fechaActual.format('HH:mm:ss');

        // Marcar el pedido como entregado
        await pool.query('UPDATE recogida_en_tienda SET fecha_recogida = ?, hora_recogida = ? WHERE id_compra = ?', [
            fechaRecogidaStr, // fecha_recogida
            horaRecogidaStr, // hora_recogida
            id_compra
        ]);

        res.redirect('/links/caja');
    } catch (error) {
        console.error(error);
        res.render('links/caja', { message: 'Error al marcar el pedido como entregado.' });
    }
});

router.get('/pedidos', isLoggedIn, async (req, res) => {
    try {
        const comprasResult = await pool.query(`
            SELECT compras.id, compras.fecha_compra, compras.hora_compra, compras.total, 
            pedidos_cocina.estado as estado_cocina, pedidos_cocina.Tipo_entrega,
            domicilios.fecha_envio, domicilios.fecha_entrega,
            recogida_en_tienda.fecha_fin_preparación, recogida_en_tienda.hora_fin_preparación,
            recogida_en_tienda.fecha_recogida, recogida_en_tienda.hora_recogida,
            cliente.nombre_completo AS nombre_cliente, cliente.telefono AS telefono
            FROM compras
            LEFT JOIN pedidos_cocina ON compras.id = pedidos_cocina.id_compra
            LEFT JOIN domicilios ON compras.id = domicilios.id_compra
            LEFT JOIN recogida_en_tienda ON compras.id = recogida_en_tienda.id_compra
            LEFT JOIN cliente ON compras.id_cliente = cliente.id
            ORDER BY compras.fecha_compra DESC, compras.hora_compra DESC
        `);

        const pedidos = await Promise.all(comprasResult.map(async compra => {
            let estado_recibido = false;
            let estado_preparado = false;
            let estado_enviado = false;
            let estado_entregado = false;

            if (compra.estado_cocina === 'recibido' || compra.estado_cocina === 'listo') {
                estado_recibido = true;
            }

            if (compra.estado_cocina === 'listo') {
                estado_preparado = true;
            }

            if (compra.fecha_entrega || compra.fecha_recogida) {
                estado_entregado = true;
                estado_enviado = true;
                estado_preparado = true;
                estado_recibido = true;
            } else if (compra.fecha_envio) {
                estado_enviado = true;
                estado_preparado = true;
                estado_recibido = true;
            }

            // Formatear la fecha de compra
            const fecha_compra = new Date(compra.fecha_compra).toLocaleDateString('es-CO', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });

            // Obtener los productos de la compra
            const productosResult = await pool.query(`
                SELECT producto.nombre, detalle_compra.cantidad
                FROM detalle_compra
                JOIN producto ON detalle_compra.id_producto = producto.id
                WHERE detalle_compra.id_compra = ?
            `, [compra.id]);

            return {
                id: compra.id,
                estado_recibido,
                estado_preparado,
                estado_enviado,
                estado_entregado,
                fecha_compra,
                hora_compra: compra.hora_compra,
                total: compra.total,
                productos: productosResult,
                nombre_cliente: compra.nombre_cliente,
                telefono: compra.telefono
            };
        }));

        res.render('links/pedidos', { pedidos });
    } catch (error) {
        console.error(error);
        res.render('links/pedidos', { pedidos: [], message: 'Error al obtener el estado de los pedidos.' });
    }
});


router.get('/estadisticas', isLoggedIn, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let query = `
            SELECT producto.nombre, SUM(detalle_compra.cantidad) as cantidad 
            FROM detalle_compra
            JOIN compras ON detalle_compra.id_compra = compras.id
            JOIN producto ON detalle_compra.id_producto = producto.id
        `;

        const queryParams = [];

        if (startDate && endDate) {
            query += ' WHERE compras.fecha_compra BETWEEN ? AND ?';
            queryParams.push(startDate, endDate);
        } else if (startDate) {
            query += ' WHERE compras.fecha_compra >= ?';
            queryParams.push(startDate);
        } else if (endDate) {
            query += ' WHERE compras.fecha_compra <= ?';
            queryParams.push(endDate);
        }

        query += ' GROUP BY producto.nombre';

        const result = await pool.query(query, queryParams);

        res.render('links/estadisticas', { data: JSON.stringify(result).replace(/\"/g, '\\"') });
    } catch (error) {
        console.error(error);
        res.render('links/estadisticas', { data: "[]" });
    }
});




module.exports = router;


