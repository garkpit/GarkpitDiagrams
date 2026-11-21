import { quadrant } from '../../src/layouts/quadrant.ts';

export const swot = quadrant({
  title: 'SWOT: an in-house AI assistant for customer support',
  xAxis: { low: 'helpful', high: 'harmful' },
  yAxis: { low: 'external', high: 'internal' },
  quadrants: [
    {
      title: 'Strengths',
      items: ['Five years of tagged support tickets to learn from', 'Engineers who already ship LLM features', 'Answers grounded in our own policy docs']
    },
    {
      title: 'Weaknesses',
      items: ['No evaluation set yet', 'Knowledge base is out of date in places', 'Support team has not been involved so far']
    },
    {
      title: 'Opportunities',
      items: ['Handle the 40% of contacts that are booking changes', 'Same assistant in the app and on the phone line', 'Model prices keep falling']
    },
    {
      title: 'Threats',
      items: ['A wrong refund answer becomes a news story', 'Vendor lock-in on one model provider', 'Customers who insist on a person']
    }
  ]
});

export const swotNote = 'quadrant() with bullet lists: four titled quadrants with pale fills, hanging bullets wrapped in Excalifont metrics, and every quadrant sized to the fullest one so the grid stays square. The axes are optional; here they carry the SWOT reading (helpful/harmful across, internal/external down). The vertical axis has its title on top, so a long title widens nothing but can run past the left edge if it is much wider than the end labels.';
