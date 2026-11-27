import { describe, expect, it } from 'vitest';
import { findIssuer, ISSUERS } from './issuers';

describe('who sent a proof of address', () => {
  it('names a sender from its letterhead, in any case or punctuation', () => {
    expect(findIssuer('GAINESVILLE REGIONAL UTILITIES\nP.O. Box 147051\nStatement date 10/31/2026')).toEqual({ name: 'Gainesville Regional Utilities', kind: 'utility_bill' });
    expect(findIssuer('JPMorgan Chase Bank, N.A.\nChase Total Checking\nBeginning balance $100')).toEqual({ name: 'Chase', kind: 'bank_statement' });
    expect(findIssuer('Duke Energy Florida, LLC — your bill')).toEqual({ name: 'Duke Energy', kind: 'utility_bill' });
    expect(findIssuer('AT&T Wireless\nYour monthly statement')).toEqual({ name: 'AT&T', kind: 'phone_or_internet_bill' });
    expect(findIssuer('Campus USA Credit Union - Account statement')).toEqual({ name: 'Campus USA Credit Union', kind: 'bank_statement' });
    expect(findIssuer('Florida Department of Highway Safety and Motor Vehicles')).toEqual({ name: 'Florida Highway Safety and Motor Vehicles', kind: 'government_letter' });
    expect(findIssuer('State Farm Mutual Automobile Insurance Company\nDeclarations page')).toEqual({ name: 'State Farm', kind: 'insurance_statement' });
  });

  it('never takes a first name or an everyday word for a bank', () => {
    expect(findIssuer('Chase Miller\n1234 Example Lane\nGainesville FL 32601\nThank you for your payment')).toBeUndefined();
    expect(findIssuer('Discover what is new this month. Regions of the city. A frost warning. Ally and friend.')).toBeUndefined();
    expect(findIssuer('Navy Federal is a federal credit union')).toEqual({ name: 'Navy Federal Credit Union', kind: 'bank_statement' });
  });

  it('prefers the longer name (the utility over its city) and the letterhead over the small print', () => {
    expect(findIssuer('City of Austin Utilities\nCity of Austin\nBill date 11/01/2026')).toEqual({ name: 'City of Austin Utilities', kind: 'utility_bill' });
    const body = 'x '.repeat(400);
    expect(findIssuer(`Frost Bank\n${body}\nPay online at chase.com`)).toEqual({ name: 'Frost Bank', kind: 'bank_statement' });
  });

  it('keeps every phrase distinct enough to match on its own', () => {
    for (const issuer of ISSUERS) for (const phrase of issuer.phrases) expect(phrase.trim().length, `${issuer.name}: ${phrase}`).toBeGreaterThanOrEqual(3);
  });
});
