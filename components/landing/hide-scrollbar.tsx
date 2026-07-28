'use client';

import { useEffect } from 'react';

export function HideScrollbar() {
    useEffect(() => {
        // Save original styles
        const originalHtmlStyle = window.getComputedStyle(document.documentElement).overflow;
        const originalBodyStyle = window.getComputedStyle(document.body).overflow;

        // We don't want to prevent scrolling, just hide the bar
        // Standard way to hide bar but keep scroll is:
        // scrollbar-width: none; (Firefox)
        // -ms-overflow-style: none; (IE/Edge)
        // ::-webkit-scrollbar { display: none; } (Chrome/Safari)

        // Since we are in a component, injecting a style tag is often most reliable for ::-webkit-scrollbar
        const styleId = 'landing-hide-scrollbar';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
            html, body {
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
            }
            html::-webkit-scrollbar, body::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
                background: transparent !important;
            }
        `;
            document.head.appendChild(style);
        }

        return () => {
            const style = document.getElementById(styleId);
            if (style) {
                style.remove();
            }
        };
    }, []);

    return null;
}
