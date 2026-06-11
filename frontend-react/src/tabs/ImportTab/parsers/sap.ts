export function guessSapCols(headers: string[]) {
  const lo = headers.map(h => h.toLowerCase().replace(/[\s_\-]/g, ''))
  const find = (...keys: string[]) => { for (const k of keys) { const i = lo.findIndex(h => h.includes(k)); if (i >= 0) return i } return -1 }
  return {
    order_no:      find('ordernumber', 'orderno', 'order', 'aufnr', 'materialdocument'),
    material_code: find('materialorder', 'material', 'matnr', 'itemcode', 'item5'),
    wc_id:         find('workcenter', 'workctr', 'arbpl'),
    operation:     find('optext', 'operation', 'activity', 'ltxa1', 'description'),
    std_hrs:       find('stdactivitytype3', 'stdhrs', 'standardhours', 'standardlabor', 'planarbeit', 'arbeit'),
    is_confirmed:  find('isconfirm', 'isconfirmed', 'confirmed', 'bestaetig'),
    plant:         find('plant', 'werk'),
  }
}
