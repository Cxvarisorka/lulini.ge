// Socket event payload validation wrapper.
//
// Lightweight schema validation for incoming socket events.
// No heavy library dependency — just type/shape/range checks.
//
// Usage:
//   const { validated } = require('../validate');
//
//   socket.on('driver:rejoin', validated({
//       force: { type: 'boolean', required: false },
//   }, async (data, ack) => {
//       // data is guaranteed to match the schema
//   }));
//
// Supported field options:
//   type:     'string' | 'number' | 'boolean' | 'object' | 'array'
//   required: true | false (default: false)
//   min:      minimum value (for numbers) or minimum length (for strings/arrays)
//   max:      maximum value (for numbers) or maximum length (for strings/arrays)
//   enum:     array of allowed values
//   pattern:  RegExp to test string values against

/**
 * Wrap a socket event handler with schema validation.
 *
 * @param {object} schema - Field definitions (key → validation rules)
 * @param {function} handler - The actual event handler (data, ack) => {}
 * @returns {function} Wrapped handler that validates before calling the original
 */
function validated(schema, handler) {
    return function (data, ack) {
        // Allow events with no expected payload
        if (!schema || Object.keys(schema).length === 0) {
            return handler.call(this, data, ack);
        }

        // If schema expects fields but data is not an object, reject
        if (data !== undefined && data !== null && typeof data !== 'object') {
            const error = 'Payload must be an object';
            if (typeof ack === 'function') return ack({ error });
            return; // drop silently if no ack
        }

        const payload = data || {};
        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            const value = payload[field];

            // Required check
            if (rules.required && (value === undefined || value === null)) {
                errors.push(`${field} is required`);
                continue;
            }

            // Skip remaining checks if field is absent and not required
            if (value === undefined || value === null) continue;

            // Type check
            if (rules.type) {
                const actualType = Array.isArray(value) ? 'array' : typeof value;
                if (actualType !== rules.type) {
                    errors.push(`${field} must be of type ${rules.type}`);
                    continue;
                }
            }

            // Enum check
            if (rules.enum && !rules.enum.includes(value)) {
                errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
                continue;
            }

            // Min/max for numbers
            if (rules.type === 'number') {
                if (rules.min !== undefined && value < rules.min) {
                    errors.push(`${field} must be >= ${rules.min}`);
                }
                if (rules.max !== undefined && value > rules.max) {
                    errors.push(`${field} must be <= ${rules.max}`);
                }
            }

            // Min/max length for strings and arrays
            if (rules.type === 'string' || rules.type === 'array') {
                const len = value.length;
                if (rules.min !== undefined && len < rules.min) {
                    errors.push(`${field} must have length >= ${rules.min}`);
                }
                if (rules.max !== undefined && len > rules.max) {
                    errors.push(`${field} must have length <= ${rules.max}`);
                }
            }

            // Pattern check for strings
            if (rules.pattern && rules.type === 'string' && !rules.pattern.test(value)) {
                errors.push(`${field} format is invalid`);
            }
        }

        if (errors.length > 0) {
            if (typeof ack === 'function') {
                return ack({ error: errors[0], errors });
            }
            return; // drop silently if no ack callback
        }

        return handler.call(this, payload, ack);
    };
}

module.exports = { validated };
