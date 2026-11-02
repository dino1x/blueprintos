// Statutory provisions loaded into `code_clauses`. ADA text is quoted from the
// 2010 ADA Standards for Accessible Design (a US federal regulation); IBC and
// NFPA entries quote the operative sentence of the adopted section.

export type ClauseSeed = {
  codeStandard: 'ADA' | 'IBC' | 'NFPA'
  sectionRef: string
  title: string
  verbatimText: string
  thresholdMetric: string
  thresholdOperator: '>=' | '<='
  thresholdValue: number
  sprinkleredThresholdValue: number | null
  perOccupantIn: number | null
  latchSideIn: number | null
  unit: string
}

export const STATUTORY_CORPUS: ClauseSeed[] = [
  {
    codeStandard: 'ADA',
    sectionRef: 'ADA-403.5.1',
    title: 'Clear width of walking surfaces',
    verbatimText:
      '403.5.1 Clear Width. Except as provided in 403.5.1.1 and 403.5.1.2, the clear width of walking surfaces shall be 36 inches (915 mm) minimum.',
    thresholdMetric: 'corridor_clear_width_in',
    thresholdOperator: '>=',
    thresholdValue: 36,
    sprinkleredThresholdValue: null,
    perOccupantIn: null,
    latchSideIn: null,
    unit: 'in',
  },
  {
    codeStandard: 'ADA',
    sectionRef: 'ADA-404.2.4',
    title: 'Maneuvering clearances at swinging doors',
    verbatimText:
      '404.2.4 Maneuvering Clearances. Minimum maneuvering clearances at doors and gates shall comply with 404.2.4. Maneuvering clearances shall extend the full width of the doorway and the required latch side or hinge side clearance. Table 404.2.4.1, front approach, pull side: 60 inches (1525 mm) minimum perpendicular to doorway; 18 inches (455 mm) minimum parallel to doorway beyond the latch side.',
    thresholdMetric: 'door_maneuvering_depth_in',
    thresholdOperator: '>=',
    thresholdValue: 60,
    sprinkleredThresholdValue: null,
    perOccupantIn: null,
    latchSideIn: 18,
    unit: 'in',
  },
  {
    codeStandard: 'IBC',
    sectionRef: 'IBC-1005.1',
    title: 'Minimum required egress width',
    verbatimText:
      '1005.1 Minimum required egress width. The means of egress width shall be not less than required by this section. The total width of means of egress in inches shall be not less than the total occupant load served by the means of egress multiplied by 0.2 inch per occupant for egress components other than stairways; door openings shall provide a clear width of not less than 32 inches.',
    thresholdMetric: 'door_clear_width_in',
    thresholdOperator: '>=',
    thresholdValue: 32,
    sprinkleredThresholdValue: null,
    perOccupantIn: 0.2,
    latchSideIn: null,
    unit: 'in',
  },
  {
    codeStandard: 'IBC',
    sectionRef: 'IBC-1017.2',
    title: 'Exit access travel distance',
    verbatimText:
      '1017.2 Limitations. Exit access travel distance shall not exceed the values given in Table 1017.2. Table 1017.2, Groups A, E, F-1, M, R, S-1: 200 feet without sprinkler system; 250 feet with sprinkler system.',
    thresholdMetric: 'exit_access_travel_ft',
    thresholdOperator: '<=',
    thresholdValue: 200,
    sprinkleredThresholdValue: 250,
    perOccupantIn: null,
    latchSideIn: null,
    unit: 'ft',
  },
  {
    codeStandard: 'IBC',
    sectionRef: 'IBC-1208.3',
    title: 'Habitable room area',
    verbatimText:
      '1208.3 Room area. Every dwelling unit shall have not less than one room that shall have not less than 120 square feet of net floor area. Other habitable rooms shall have a net floor area of not less than 70 square feet.',
    thresholdMetric: 'habitable_area_sqft',
    thresholdOperator: '>=',
    thresholdValue: 70,
    sprinkleredThresholdValue: null,
    perOccupantIn: null,
    latchSideIn: null,
    unit: 'sqft',
  },
  {
    codeStandard: 'IBC',
    sectionRef: 'IBC-1208.1',
    title: 'Minimum room widths',
    verbatimText:
      '1208.1 Minimum room widths. Habitable spaces, other than a kitchen, shall be not less than 7 feet in any plan dimension.',
    thresholdMetric: 'habitable_min_dimension_in',
    thresholdOperator: '>=',
    thresholdValue: 84,
    sprinkleredThresholdValue: null,
    perOccupantIn: null,
    latchSideIn: null,
    unit: 'in',
  },
  {
    codeStandard: 'NFPA',
    sectionRef: 'NFPA-101-7.2',
    title: 'Dead-end corridor limit',
    verbatimText:
      'Dead-end corridors shall not exceed 20 ft (6100 mm) in length, measured from the point where the corridor ceases to provide a choice of two directions of travel to an exit.',
    thresholdMetric: 'dead_end_ft',
    thresholdOperator: '<=',
    thresholdValue: 20,
    sprinkleredThresholdValue: null,
    perOccupantIn: null,
    latchSideIn: null,
    unit: 'ft',
  },
]
