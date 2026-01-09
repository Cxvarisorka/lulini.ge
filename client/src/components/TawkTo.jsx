import { useEffect } from 'react';

export function TawkTo() {
  useEffect(() => {
    const propertyId = import.meta.env.VITE_TAWKTO_PROPERTY_ID;
    const widgetId = import.meta.env.VITE_TAWKTO_WIDGET_ID;

    // Don't load if credentials are not configured
    if (!propertyId || !widgetId || propertyId === 'your_property_id_here') {
      console.warn('Tawk.to: Property ID or Widget ID not configured');
      return;
    }

    // Check if script already exists
    if (document.getElementById('tawkto-script')) {
      return;
    }

    // Initialize Tawk.to
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const script = document.createElement('script');
    script.id = 'tawkto-script';
    script.async = true;
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');

    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount
      const existingScript = document.getElementById('tawkto-script');
      if (existingScript) {
        existingScript.remove();
      }
      // Remove Tawk.to iframe if exists
      const tawkIframe = document.querySelector('iframe[title*="chat"]');
      if (tawkIframe) {
        tawkIframe.remove();
      }
    };
  }, []);

  return null;
}

// Utility functions to control Tawk.to widget
export const tawkToUtils = {
  // Maximize the chat widget
  maximize: () => {
    if (window.Tawk_API?.maximize) {
      window.Tawk_API.maximize();
    }
  },

  // Minimize the chat widget
  minimize: () => {
    if (window.Tawk_API?.minimize) {
      window.Tawk_API.minimize();
    }
  },

  // Toggle the chat widget
  toggle: () => {
    if (window.Tawk_API?.toggle) {
      window.Tawk_API.toggle();
    }
  },

  // Hide the widget
  hideWidget: () => {
    if (window.Tawk_API?.hideWidget) {
      window.Tawk_API.hideWidget();
    }
  },

  // Show the widget
  showWidget: () => {
    if (window.Tawk_API?.showWidget) {
      window.Tawk_API.showWidget();
    }
  },

  // Set visitor attributes
  setAttributes: (attributes) => {
    if (window.Tawk_API?.setAttributes) {
      window.Tawk_API.setAttributes(attributes);
    }
  },

  // Add event listener
  onLoad: (callback) => {
    if (window.Tawk_API) {
      window.Tawk_API.onLoad = callback;
    }
  }
};
