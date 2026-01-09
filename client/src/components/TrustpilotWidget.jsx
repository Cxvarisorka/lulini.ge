import { useEffect, useRef } from 'react';

// Trustpilot Mini Widget - Shows rating and star score
export function TrustpilotMini({ className = '' }) {
  const ref = useRef(null);
  const businessUnitId = import.meta.env.VITE_TRUSTPILOT_BUSINESS_UNIT_ID;
  const domain = import.meta.env.VITE_TRUSTPILOT_DOMAIN;

  useEffect(() => {
    if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
      return;
    }

    // Load Trustpilot script if not already loaded
    if (!document.getElementById('trustpilot-script')) {
      const script = document.createElement('script');
      script.id = 'trustpilot-script';
      script.src = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
      script.async = true;
      document.head.appendChild(script);
    }

    // Initialize widget when script loads
    const initWidget = () => {
      if (window.Trustpilot && ref.current) {
        window.Trustpilot.loadFromElement(ref.current, true);
      }
    };

    if (window.Trustpilot) {
      initWidget();
    } else {
      window.addEventListener('load', initWidget);
      return () => window.removeEventListener('load', initWidget);
    }
  }, [businessUnitId]);

  if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`trustpilot-widget ${className}`}
      data-locale="en-US"
      data-template-id="5419b6a8b0d04a076446a9ad"
      data-businessunit-id={businessUnitId}
      data-style-height="24px"
      data-style-width="100%"
      data-theme="light"
    >
      <a
        href={`https://www.trustpilot.com/review/${domain}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Trustpilot
      </a>
    </div>
  );
}

// Trustpilot Micro Review Count Widget
export function TrustpilotMicroReviewCount({ className = '' }) {
  const ref = useRef(null);
  const businessUnitId = import.meta.env.VITE_TRUSTPILOT_BUSINESS_UNIT_ID;
  const domain = import.meta.env.VITE_TRUSTPILOT_DOMAIN;

  useEffect(() => {
    if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
      return;
    }

    if (!document.getElementById('trustpilot-script')) {
      const script = document.createElement('script');
      script.id = 'trustpilot-script';
      script.src = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
      script.async = true;
      document.head.appendChild(script);
    }

    const initWidget = () => {
      if (window.Trustpilot && ref.current) {
        window.Trustpilot.loadFromElement(ref.current, true);
      }
    };

    if (window.Trustpilot) {
      initWidget();
    } else {
      window.addEventListener('load', initWidget);
      return () => window.removeEventListener('load', initWidget);
    }
  }, [businessUnitId]);

  if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`trustpilot-widget ${className}`}
      data-locale="en-US"
      data-template-id="5419b637fa0340045cd0c936"
      data-businessunit-id={businessUnitId}
      data-style-height="20px"
      data-style-width="100%"
      data-theme="light"
    >
      <a
        href={`https://www.trustpilot.com/review/${domain}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Trustpilot
      </a>
    </div>
  );
}

// Trustpilot Carousel Widget - Shows multiple reviews
export function TrustpilotCarousel({ className = '' }) {
  const ref = useRef(null);
  const businessUnitId = import.meta.env.VITE_TRUSTPILOT_BUSINESS_UNIT_ID;
  const domain = import.meta.env.VITE_TRUSTPILOT_DOMAIN;

  useEffect(() => {
    if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
      return;
    }

    if (!document.getElementById('trustpilot-script')) {
      const script = document.createElement('script');
      script.id = 'trustpilot-script';
      script.src = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
      script.async = true;
      document.head.appendChild(script);
    }

    const initWidget = () => {
      if (window.Trustpilot && ref.current) {
        window.Trustpilot.loadFromElement(ref.current, true);
      }
    };

    if (window.Trustpilot) {
      initWidget();
    } else {
      window.addEventListener('load', initWidget);
      return () => window.removeEventListener('load', initWidget);
    }
  }, [businessUnitId]);

  if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`trustpilot-widget ${className}`}
      data-locale="en-US"
      data-template-id="53aa8912dec7e10d38f59f36"
      data-businessunit-id={businessUnitId}
      data-style-height="140px"
      data-style-width="100%"
      data-theme="light"
      data-stars="4,5"
      data-review-languages="en"
    >
      <a
        href={`https://www.trustpilot.com/review/${domain}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Trustpilot
      </a>
    </div>
  );
}

// Trustpilot Review Collector Widget
export function TrustpilotReviewCollector({ className = '' }) {
  const ref = useRef(null);
  const businessUnitId = import.meta.env.VITE_TRUSTPILOT_BUSINESS_UNIT_ID;
  const domain = import.meta.env.VITE_TRUSTPILOT_DOMAIN;

  useEffect(() => {
    if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
      return;
    }

    if (!document.getElementById('trustpilot-script')) {
      const script = document.createElement('script');
      script.id = 'trustpilot-script';
      script.src = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
      script.async = true;
      document.head.appendChild(script);
    }

    const initWidget = () => {
      if (window.Trustpilot && ref.current) {
        window.Trustpilot.loadFromElement(ref.current, true);
      }
    };

    if (window.Trustpilot) {
      initWidget();
    } else {
      window.addEventListener('load', initWidget);
      return () => window.removeEventListener('load', initWidget);
    }
  }, [businessUnitId]);

  if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`trustpilot-widget ${className}`}
      data-locale="en-US"
      data-template-id="56278e9abfbbba0bdcd568bc"
      data-businessunit-id={businessUnitId}
      data-style-height="52px"
      data-style-width="100%"
    >
      <a
        href={`https://www.trustpilot.com/review/${domain}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Trustpilot
      </a>
    </div>
  );
}

// Trustpilot Horizontal Widget - Shows rating with stars
export function TrustpilotHorizontal({ className = '', theme = 'light' }) {
  const ref = useRef(null);
  const businessUnitId = import.meta.env.VITE_TRUSTPILOT_BUSINESS_UNIT_ID;
  const domain = import.meta.env.VITE_TRUSTPILOT_DOMAIN;

  useEffect(() => {
    if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
      return;
    }

    if (!document.getElementById('trustpilot-script')) {
      const script = document.createElement('script');
      script.id = 'trustpilot-script';
      script.src = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
      script.async = true;
      document.head.appendChild(script);
    }

    const initWidget = () => {
      if (window.Trustpilot && ref.current) {
        window.Trustpilot.loadFromElement(ref.current, true);
      }
    };

    if (window.Trustpilot) {
      initWidget();
    } else {
      window.addEventListener('load', initWidget);
      return () => window.removeEventListener('load', initWidget);
    }
  }, [businessUnitId]);

  if (!businessUnitId || businessUnitId === 'your_business_unit_id_here') {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`trustpilot-widget ${className}`}
      data-locale="en-US"
      data-template-id="5406e65db0d04a09e042d5fc"
      data-businessunit-id={businessUnitId}
      data-style-height="28px"
      data-style-width="100%"
      data-theme={theme}
    >
      <a
        href={`https://www.trustpilot.com/review/${domain}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Trustpilot
      </a>
    </div>
  );
}
