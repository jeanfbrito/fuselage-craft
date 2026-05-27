/**
 * good.tsx — fixture that should pass the fuselage-craft gate.
 *
 * Uses Box with semantic token props, Field wrapper around inputs,
 * and Fuselage components (Button). No raw hex, no literal px, no literal shadows.
 */

import React from 'react';
import { Box, Button, Field, FieldLabel, FieldRow } from '@rocket.chat/fuselage';
import { TextInput } from '@rocket.chat/fuselage-forms';

export function GoodComponent() {
  return (
    <Box color='default' p='x16'>
      <Field>
        <FieldLabel>Name</FieldLabel>
        <FieldRow>
          <TextInput placeholder='Enter your name' />
        </FieldRow>
      </Field>
      <Button primary>Submit</Button>
    </Box>
  );
}
