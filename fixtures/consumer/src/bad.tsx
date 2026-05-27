/**
 * bad.tsx — fixture that SHOULD trip the fuselage-craft gate.
 *
 * Contains:
 *  - Literal hex color in style object      → no-raw-color error
 *  - Literal px padding in style object     → no-literal-dimension error
 *  - Literal box-shadow in style object     → no-literal-shadow error
 *  - Bare <input> outside any Field wrapper → require-field-wrapper warn
 *  - Raw <div> with inline style object     → prefer-box warn
 */

import React from 'react';

export function BadComponent() {
  return (
    <div style={{ padding: '16px', color: '#156FF5', boxShadow: '0 0 4px #000' }}>
      <input type='text' placeholder='Raw input outside Field' />
    </div>
  );
}
