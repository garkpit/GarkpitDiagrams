import { colour } from '../../src/index.ts';
import { er } from '../../src/layouts/er.ts';

export const erDiagram = er({
  title: 'Booking system data model',
  gapX: 170,
  entities: [
    {
      id: 'customer',
      c: 0,
      r: 0,
      fields: ['id: uuid PK', 'email: text UQ', 'full_name: text', 'phone: text', 'created_at: timestamptz']
    },
    {
      id: 'booking',
      c: 1,
      r: 0,
      fields: ['id: uuid PK', 'reference: char(8) UQ', 'customer_id: uuid FK', 'status: booking_status', 'total_pence: integer', 'currency: char(3)', 'created_at: timestamptz']
    },
    {
      id: 'payment',
      c: 2,
      r: 0,
      fill: colour.green,
      fields: ['id: uuid PK', 'booking_id: uuid FK', 'amount_pence: integer', 'provider: text', 'provider_ref: text UQ', 'status: payment_status', 'refund_of: uuid FK', 'paid_at: timestamptz']
    },
    {
      id: 'booking_item',
      c: 1,
      r: 1,
      fields: ['id: uuid PK', 'booking_id: uuid FK', 'product_id: uuid FK', 'starts_on: date', 'ends_on: date', 'price_pence: integer']
    },
    {
      id: 'product',
      c: 2,
      r: 1,
      fill: colour.yellow,
      fields: ['id: uuid PK', 'supplier_id: uuid FK', 'kind: product_kind', 'name: text', 'location: text']
    },
    {
      id: 'supplier',
      c: 0,
      r: 1,
      fill: colour.yellow,
      fields: ['id: uuid PK', 'name: text', 'contact_email: text', 'commission_pct: numeric(5,2)']
    }
  ],
  relations: [
    { from: 'booking', to: 'customer', fromField: 'customer_id', toField: 'id', fromCard: 'N', toCard: '1', label: 'placed by' },
    { from: 'payment', to: 'booking', fromField: 'booking_id', toField: 'id', fromCard: 'N', toCard: '1', label: 'pays for' },
    { from: 'payment', to: 'payment', fromField: 'refund_of', toField: 'id', fromCard: 'N', toCard: '0..1', label: 'refunds' },
    { from: 'booking_item', to: 'booking', fromField: 'booking_id', toField: 'id', fromCard: '1..*', toCard: '1' },
    { from: 'booking_item', to: 'product', fromField: 'product_id', toField: 'id', fromCard: 'N', toCard: '1' },
    { from: 'product', to: 'supplier', fromField: 'supplier_id', toField: 'id', fromCard: 'N', toCard: '1', label: 'sold by' }
  ]
});

export const erNote =
  "er(): six tables of a booking system on a 3x2 grid. Tables are measured in Excalifont (key, name and type columns) and the router picks straight, L, Z (through a column or row gap) or C routes by fewest bends, then crossings, then length; side-by-side tables join at their FK and PK row heights, the payment self-relation loops round its right side and supplier-product runs a U under booking_item. Channel tracks and end anchors spread so lines never share a stretch. Limits: lines carry text cardinality (1, N, 0..1) rather than crow's-foot glyphs; a name label needs room, so a one-row Z jog in a narrow gap crowds its labels (this scene uses gapX 170); no automatic placement, you choose c/r.";
