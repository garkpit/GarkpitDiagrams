import { colour, flow } from '../../src/index.ts';

// Nested bands on plain grid cells: flow() works out which band holds which and pads each level.
export const architecture = flow({
  title: 'Booking platform on AWS',
  cellW: 200,
  gapX: 110,
  nodes: [
    { id: 'browser', c: 4, r: 0, text: 'Web browser', kind: 'pill', fill: colour.paper },
    { id: 'app', c: 4, r: 1, text: 'Mobile app', kind: 'pill', fill: colour.paper },
    { id: 'secrets', c: 1, r: 0, text: 'Secrets Manager', fill: colour.violet },
    { id: 's3', c: 2, r: 0, text: 'S3: static site', kind: 'store' },
    { id: 'cdn', c: 3, r: 0, text: 'CloudFront CDN', fill: colour.violet },
    { id: 'nat', c: 1, r: 1, text: 'NAT gateway', fill: colour.blue },
    { id: 'alb', c: 3, r: 1, text: 'Load balancer', fill: colour.blue },
    { id: 'worker', c: 1, r: 2, text: 'Worker (ECS)', fill: colour.green },
    { id: 'db', c: 2, r: 2, text: 'Postgres (RDS, multi-AZ)', kind: 'store' },
    { id: 'api', c: 3, r: 2, text: 'API service (ECS, 3 tasks)', fill: colour.green },
    { id: 'psp', c: 0, r: 1, text: 'Payment provider', kind: 'pill', fill: colour.orange }
  ],
  bands: [
    { c: 1, r: 0, cw: 3, rh: 3, label: 'AWS account: booking-prod', fill: '#fff9db' },
    { c: 1, r: 1, cw: 3, rh: 2, label: 'VPC 10.0.0.0/16, two AZs', fill: '#e7f5ff' },
    { c: 1, r: 1, cw: 3, rh: 1, label: 'Public', fill: '#e6fcf5' },
    { c: 1, r: 2, cw: 3, rh: 1, label: 'Private', fill: '#f3f0ff' }
  ],
  edges: [
    { from: 'browser', to: 'cdn', label: 'HTTPS' },
    { from: 'cdn', to: 's3', label: 'static' },
    { from: 'cdn', to: 'alb', label: '/api/*' },
    { from: 'app', to: 'alb', label: 'HTTPS' },
    { from: 'alb', to: 'api' },
    { from: 'api', to: 'db', label: 'SQL' },
    { from: 'worker', to: 'db', label: 'SQL' },
    { from: 'worker', to: 'nat', label: 'egress' },
    { from: 'nat', to: 'psp', label: 'HTTPS' }
  ]
});

export const architectureNote =
  "AWS account, VPC and public/private subnet bands with flow bands, external clients and a payment provider outside. The bands are plain integer cells (account c1 r0 3x3, VPC c1 r1 3x2, subnets one row each) with default gaps: flow() sees which band holds which, pads each level a further 20 px at the sides and bottom and a label line at the top, and grows the gap above a row to fit the header stack of the bands starting there (and the padding of those ending above), so nothing is offset by hand. Band labels can sit top-right (`labelAt: 'right'`) when an arrow climbs out of a band's first column; here both subnet columns carry a vertical arrow, so the subnet labels stay short and top-left, and the fit check's arrow-through-text rule catches a label an arrow runs through. Still by hand: column gaps do not grow, so gapX must leave room for the side padding of deeply nested bands next to an outside node.";
