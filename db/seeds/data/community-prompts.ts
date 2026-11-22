import type { CommunityPromptConfig } from '../../../src/modules/markets/schema';

/**
 * Neighbors' seasonal starters for the seeded cities (plan 10.18). Production gets the same values from migration 0076;
 * a new city's come with its market data.
 */
export const GAINESVILLE_COMMUNITY_PROMPTS: CommunityPromptConfig[] = [
  { months: [2, 3, 4], kind: 'recommendation', category: 'yard-cleanup', en: 'Who do you recommend for a spring yard cleanup?', es: '¿A quién recomiendan para limpiar el jardín en primavera?' },
  { months: [4, 5], kind: 'recommendation', category: 'moving-help', en: 'Who can help me load a truck at the end of the semester?', es: '¿Quién me puede ayudar a cargar un camión al terminar el semestre?' },
  { months: [4, 5, 7], kind: 'recommendation', category: 'light-cleaning', en: 'Who do you recommend for a move-out clean before my lease ends?', es: '¿A quién recomiendan para limpiar el apartamento antes de entregarlo?' },
  { months: [7, 8], kind: 'recommendation', category: 'furniture-assembly', en: "New for the fall semester: who's great at assembling furniture?", es: 'Recién llegado para el semestre de otoño: ¿quién arma muebles bien?' },
  { months: [8], kind: 'recommendation', category: 'moving-help', en: 'Who can help carry boxes up to a second-floor apartment?', es: '¿Quién me ayuda a subir cajas a un segundo piso?' },
  { months: [6, 7, 8, 9, 10, 11], kind: 'recommendation', category: 'yard-cleanup', en: 'After a storm: who helps pick up branches and debris in the yard?', es: 'Después de una tormenta: ¿quién ayuda a recoger ramas y escombros del jardín?' },
  { months: [6], kind: 'tip', en: 'Your best tip for getting ready for storm season', es: 'Tu mejor consejo para prepararse para la temporada de tormentas' },
  { months: [11, 12, 1], kind: 'recommendation', category: 'yard-cleanup', en: 'Leaves everywhere: who do you recommend for a leaf cleanup?', es: 'Hojas por todas partes: ¿a quién recomiendan para recoger hojas?' },
  { months: [11, 12], kind: 'recommendation', category: 'light-cleaning', en: "Hosting for the holidays: who's great at a quick deep clean?", es: 'Recibo visitas en las fiestas: ¿quién hace una buena limpieza profunda?' },
  { months: [12, 1], kind: 'recommendation', category: 'computer-help', en: 'Who can help set up a new phone or laptop for a parent?', es: '¿Quién puede ayudar a configurar un teléfono o una computadora nueva para mis padres?' },
];

export const AUSTIN_COMMUNITY_PROMPTS: CommunityPromptConfig[] = [
  { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], kind: 'recommendation', category: 'furniture-assembly', en: 'Who do you recommend for putting together a bed frame?', es: '¿A quién recomiendan para armar una base de cama?' },
  { months: [10, 11, 12], kind: 'recommendation', category: 'yard-cleanup', en: "Who's good at a fall leaf cleanup?", es: '¿Quién es bueno para recoger hojas en otoño?' },
  { months: [5, 6, 7, 8], kind: 'question', category: 'moving-help', en: 'Moving in the summer heat: what time of day works best?', es: 'Mudarse con el calor del verano: ¿a qué hora conviene?' },
];
