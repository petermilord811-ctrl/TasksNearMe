/** The provider refused the text for the number itself: no use retrying it. */
export class SmsRejectedError extends Error {
  constructor(
    readonly reason: 'invalid_number' | 'opted_out',
    readonly providerCode?: number,
  ) {
    super(`The text was refused (${reason}${providerCode !== undefined ? `, ${providerCode}` : ''})`);
    this.name = 'SmsRejectedError';
  }
}
