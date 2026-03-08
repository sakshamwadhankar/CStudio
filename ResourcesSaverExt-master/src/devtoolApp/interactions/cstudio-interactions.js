/**
 * CStudio Interactions v1.0
 * Vanilla JS interactions for cloned websites
 * No React, no frameworks - pure JS
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        console.log('🚀 CStudio Interactions loaded');
        initScrollReveal();
        initNavbarScroll();
        initHamburgerMenu();
        initVideoAutoplay();
        initAccordion();
    });

    // 1. Scroll Reveal Animations
    function initScrollReveal() {
        const revealElements = document.querySelectorAll(
            '.cstudio-animate-me, [data-animate], .reveal-wrapper, ' +
            'section > div, .hero-content, article, .card'
        );

        if (revealElements.length === 0) return;
        console.log('✨ Found ' + revealElements.length + ' elements to animate');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    if (typeof gsap !== 'undefined') {
                        gsap.fromTo(el,
                            { opacity: 0, y: 50 },
                            { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }
                        );
                    } else {
                        el.style.opacity = '1';
                        el.style.transform = 'translateY(0)';
                    }
                    el.classList.add('is-revealed');
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        revealElements.forEach(el => {
            if (el.classList.contains('is-revealed')) return;
            el.style.opacity = '0';
            el.style.transform = 'translateY(50px)';
            el.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
            observer.observe(el);
        });
        console.log('✅ Scroll reveal initialized');
    }

    // 2. Navbar Scroll Effect
    function initNavbarScroll() {
        const navbar = document.querySelector(
            'header, nav, .navbar, .header, [class*="nav"], [class*="header"]'
        );
        if (!navbar) return;
        console.log('🎯 Navbar found');

        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            const currentScroll = window.scrollY;
            if (currentScroll > 100) {
                navbar.classList.add('is-scrolled');
                navbar.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
                navbar.style.backdropFilter = 'blur(10px)';
                navbar.style.boxShadow = '0 2px 20px rgba(0,0,0,0.3)';
            } else {
                navbar.classList.remove('is-scrolled');
                navbar.style.backgroundColor = '';
                navbar.style.backdropFilter = '';
                navbar.style.boxShadow = '';
            }
            if (currentScroll > lastScroll && currentScroll > 200) {
                navbar.style.transform = 'translateY(-100%)';
            } else {
                navbar.style.transform = 'translateY(0)';
            }
            lastScroll = currentScroll;
        });
        navbar.style.transition = 'all 0.3s ease';
        console.log('✅ Navbar scroll initialized');
    }

    // 3. Hamburger Menu Toggle
    function initHamburgerMenu() {
        const hamburger = document.querySelector(
            '[class*="hamburger"], [class*="burger"], [class*="menu-toggle"], ' +
            'button[aria-label*="menu"], .mobile-menu-btn'
        );
        const mobileMenu = document.querySelector(
            '[class*="mobile-menu"], [class*="nav-menu"], .menu-drawer, ' +
            '[class*="drawer"], nav[class*="mobile"]'
        );
        if (!hamburger) return;
        console.log('🍔 Hamburger found');

        let isOpen = false;
        hamburger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isOpen = !isOpen;
            hamburger.classList.toggle('is-active');
            hamburger.classList.toggle('is-open');
            hamburger.setAttribute('aria-expanded', isOpen);

            if (mobileMenu) {
                mobileMenu.classList.toggle('is-open');
                if (isOpen) {
                    mobileMenu.style.transform = 'translateX(0)';
                    mobileMenu.style.opacity = '1';
                    mobileMenu.style.visibility = 'visible';
                    mobileMenu.style.pointerEvents = 'auto';
                    document.body.style.overflow = 'hidden';
                } else {
                    mobileMenu.style.transform = 'translateX(-100%)';
                    mobileMenu.style.opacity = '0';
                    mobileMenu.style.visibility = 'hidden';
                    mobileMenu.style.pointerEvents = 'none';
                    document.body.style.overflow = '';
                }
            }
            console.log('🍔 Menu:', isOpen ? 'open' : 'closed');
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) hamburger.click();
        });
        console.log('✅ Hamburger menu initialized');
    }

    // 4. Video Autoplay on Viewport
    function initVideoAutoplay() {
        const videos = document.querySelectorAll('video');
        if (videos.length === 0) return;
        console.log('🎬 Found ' + videos.length + ' videos');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    video.play().catch(() => {
                        video.muted = true;
                        video.play().catch(() => { });
                    });
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.3 });

        videos.forEach(video => {
            video.muted = true;
            video.playsInline = true;
            video.loop = true;
            video.removeAttribute('autoplay');
            observer.observe(video);
            video.addEventListener('click', () => {
                if (video.paused) video.play();
                else video.pause();
            });
        });
        console.log('✅ Video autoplay initialized');
    }

    // 5. Accordion Toggle
    function initAccordion() {
        const triggers = document.querySelectorAll(
            '[data-accordion], [class*="accordion"] button, ' +
            '[aria-expanded], [data-state="closed"], [data-state="open"]'
        );
        if (triggers.length === 0) return;
        console.log('📂 Found ' + triggers.length + ' accordion triggers');

        triggers.forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                const panelId = trigger.getAttribute('aria-controls');
                let panel = panelId ? document.getElementById(panelId) :
                    trigger.nextElementSibling ||
                    trigger.parentElement?.nextElementSibling;
                if (!panel) return;

                const isOpen = trigger.getAttribute('aria-expanded') === 'true' ||
                    trigger.getAttribute('data-state') === 'open';

                trigger.setAttribute('aria-expanded', !isOpen);
                trigger.setAttribute('data-state', isOpen ? 'closed' : 'open');
                panel.setAttribute('data-state', isOpen ? 'closed' : 'open');
                panel.hidden = isOpen;
                panel.style.height = isOpen ? '0' : 'auto';
                panel.style.overflow = isOpen ? 'hidden' : 'visible';

                const icon = trigger.querySelector('svg, [class*="chevron"]');
                if (icon) icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
                console.log('📂 Accordion:', isOpen ? 'closed' : 'open');
            });
        });
        console.log('✅ Accordion initialized');
    }

})();
