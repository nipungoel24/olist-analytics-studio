import { describe, it, expect } from 'vitest'
import {
  resolveDateRange,
  resolveSaoPaulo,
  resolveTopN,
  resolveWorst,
  resolveElectronics,
  detectUnsupported,
} from './normalizer.js'

describe('resolveDateRange', () => {
  it('"last year" always means 2017, never the machine year', () => {
    const r = resolveDateRange('Show revenue for last year')
    expect(r.values.from).toBe('2017-01-01')
    expect(r.values.to).toBe('2017-12-31')
    expect(r.assumptions.some((a) => a.includes('2017'))).toBe(true)
  })

  it('"first half of 2017" resolves to H1 2017', () => {
    const r = resolveDateRange('Revenue in the first half of 2017')
    expect(r.values.from).toBe('2017-01-01')
    expect(r.values.to).toBe('2017-06-30')
  })

  it('explicit year 2017 resolves to the full calendar year', () => {
    const r = resolveDateRange('Show monthly revenue trend for 2017')
    expect(r.values.from).toBe('2017-01-01')
    expect(r.values.to).toBe('2017-12-31')
  })

  it('no date range adds a transparent assumption and no silent 2017', () => {
    const r = resolveDateRange('Which product categories generate the most revenue?')
    expect(r.values.from).toBeUndefined()
    expect(r.values.to).toBeUndefined()
    expect(r.assumptions.some((a) => a.includes('full'))).toBe(true)
  })
})

describe('resolveSaoPaulo', () => {
  it('resolves São Paulo to SP for seller-side questions', () => {
    const r = resolveSaoPaulo('Top 10 sellers by revenue in São Paulo', 'seller')
    expect(r.values.state).toBe('SP')
    expect(r.values.stateSide).toBe('seller_state')
  })

  it('resolves Sao Paulo (no accent) to SP for destination questions', () => {
    const r = resolveSaoPaulo('Delivery delay in Sao Paulo', 'destination')
    expect(r.values.state).toBe('SP')
    expect(r.values.stateSide).toBe('customer_state')
  })

  it('resolves bare SP', () => {
    const r = resolveSaoPaulo('Top sellers in SP', 'seller')
    expect(r.values.state).toBe('SP')
  })

  it('does not match unrelated text', () => {
    const r = resolveSaoPaulo('Top categories by revenue', 'seller')
    expect(r.values.state).toBeUndefined()
  })
})

describe('resolveTopN', () => {
  it('resolves "top 10" to limit 10 descending', () => {
    const r = resolveTopN('Top 10 sellers by revenue')
    expect(r.values.limit).toBe(10)
    expect(r.values.sort).toBe('desc')
  })

  it('resolves "top 5"', () => {
    const r = resolveTopN('Compare reviews across the top 5 categories')
    expect(r.values.limit).toBe(5)
  })

  it('clamps absurd limits to the allowed bound', () => {
    const r = resolveTopN('Top 99 sellers')
    expect(r.values.limit).toBe(99)
  })
})

describe('resolveWorst', () => {
  it('resolves "worst" to ascending', () => {
    const r = resolveWorst('Which states have the worst delivery performance?')
    expect(r.values.sort).toBe('asc')
  })

  it('does not fire on neutral questions', () => {
    const r = resolveWorst('Show monthly revenue for 2017')
    expect(r.values.sort).toBeUndefined()
  })
})

describe('resolveElectronics', () => {
  it('resolves electronics through the English category name', () => {
    const r = resolveElectronics('Show review score distribution for electronics')
    expect(r.values.category).toBe('electronics')
  })

  it('handles the Portuguese spelling deterministically', () => {
    const r = resolveElectronics('Score distribution for eletronicos')
    expect(r.values.category).toBe('electronics')
  })
})

describe('detectUnsupported', () => {
  it('flags stock questions', () => {
    const r = detectUnsupported('What is the stock price of Olist?')
    expect(r).not.toBeNull()
  })

  it('flags demographics', () => {
    expect(detectUnsupported('Customer ages in São Paulo')).not.toBeNull()
    expect(detectUnsupported('Customer gender distribution')).not.toBeNull()
  })

  it('flags profit/inventory', () => {
    expect(detectUnsupported('What is the profit margin?')).not.toBeNull()
    expect(detectUnsupported('How much inventory is left?')).not.toBeNull()
  })

  it('flags weather', () => {
    expect(detectUnsupported('Weather in Rio')).not.toBeNull()
  })

  it('does not flag analytics questions', () => {
    expect(detectUnsupported('Show monthly revenue trend for 2017')).toBeNull()
  })
})
