const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const passport = require('passport');
const pool = require('../database');
const { isLoggedIn } = require('../lib/auth');

router.get('/signup', (req, res) => {
    res.render('auth/signup');
});

router.post('/signup', [
    body('username').notEmpty().isLength({ min: 5 }).withMessage('Username must be at least 5 characters long'),
    body('password').notEmpty().isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
], (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    passport.authenticate('local.signup', (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            return res.redirect('/signup');
        }
        req.logIn(user, async (err) => {
            if (err) {
                return next(err);
            }
            const userCart = user.cart ? JSON.parse(user.cart) : [];
            req.session.cart = userCart;
            if (user.roles === 'admin') {
                return res.redirect('/links');
            } else if (user.roles === 'usuario') {
                return res.redirect('/links/listUsers');
            } else {
                return res.redirect('/profile');
            }
        });
    })(req, res, next);
});

router.get('/signin', (req, res) => {
    res.render('auth/signin');
});

router.post('/signin', [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
], (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorsMessages = errors.array().map(e => e.msg).join('<br>');
        const script = `Swal.fire('Error', '${errorsMessages}', 'error');`;
        return res.render('auth/signin', { script });
    }
    passport.authenticate('local.signin', (err, user, info = {}) => {
        if (err) {
            const script = `Swal.fire('Error', 'Login failed, please try again.', 'error');`;
            return res.render('auth/signin', { script });
        }
        if (!user) {
            const script = `Swal.fire('Error', '${info.message || 'Authentication failed'}', 'error');`;
            return res.render('auth/signin', { script });
        }
        req.logIn(user, async (err) => {
            if (err) {
                const script = `Swal.fire('Error', 'Session could not be created', 'error');`;
                return res.render('auth/signin', { script });
            }
            const userCart = user.cart ? JSON.parse(user.cart) : [];
            req.session.cart = userCart;
            if (user.roles === 'admin') {
                return res.redirect('/links');
            } else if (user.roles === 'usuario') {
                return res.redirect('/links/listUsers');
            } else {
                return res.redirect('/profile');
            }
        });
    })(req, res, next);
});

router.get('/profile', isLoggedIn, (req, res) => {
    res.render('profile');
});

router.get('/logout', async (req, res) => {
    if (req.isAuthenticated() && req.user && req.session.cart) {
        const cart = JSON.stringify(req.session.cart);
        await pool.query('UPDATE users SET cart = ? WHERE id = ?', [cart, req.user.id]);
    }
    req.logOut(() => {});
    res.redirect('signin');
});

module.exports = router;
