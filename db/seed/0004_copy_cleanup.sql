-- 0004 · Removes the demo notes that seeds 0001/0002 wrote into catalog content.
-- Seeds already applied are checksummed and never edited, so the cleanup is its
-- own step. Each statement only touches rows that still carry the exact text.

UPDATE products
SET details = array_remove(details, 'La imagen es una representación digital, no una fotografía del producto.')
WHERE 'La imagen es una representación digital, no una fotografía del producto.' = ANY (details);

UPDATE products
SET details = array_remove(details, 'En esta demo, la solicitud es una simulación local.')
WHERE 'En esta demo, la solicitud es una simulación local.' = ANY (details);

UPDATE categories
SET description = replace(description, ' En esta demo se muestran como referencia visual.', '')
WHERE description LIKE '% En esta demo se muestran como referencia visual.%';

UPDATE categories
SET description = replace(description, ' Se cotizan a pedido: en esta demo, el formulario es solo una simulación.', ' Se cotizan a pedido.')
WHERE description LIKE '% Se cotizan a pedido: en esta demo, el formulario es solo una simulación.%';
