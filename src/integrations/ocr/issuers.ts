import type { AddressDocumentType } from '@/contracts';
import { foldText } from './text';

/**
 * Who sent a proof of address, when it's a company or agency we recognize: the largest US banks, card issuers and credit
 * unions; the telecoms and insurers most people pay; the federal agencies that write to everyone; and the utilities,
 * banks and offices of the cities we open first (Gainesville, Florida, then Austin, Texas). Staff see the name; the
 * person sees "From Duke Energy". Recognizing the sender doesn't prove a document genuine (a forger can type any name),
 * so it's one finding among the checks, never enough on its own.
 *
 * Phrases are matched as whole folded words (foldText), so "Chase" alone, a common first name, never matches: each
 * issuer lists phrases only it prints ("JPMORGAN CHASE", "CHASE BANK", "CHASE COM").
 */

export interface Issuer {
  name: string;
  kind: AddressDocumentType;
}

type Entry = Issuer & { phrases: string[] };

const bank = (name: string, ...phrases: string[]): Entry => ({ name, kind: 'bank_statement', phrases });
const utility = (name: string, ...phrases: string[]): Entry => ({ name, kind: 'utility_bill', phrases });
const telecom = (name: string, ...phrases: string[]): Entry => ({ name, kind: 'phone_or_internet_bill', phrases });
const insurer = (name: string, ...phrases: string[]): Entry => ({ name, kind: 'insurance_statement', phrases });
const government = (name: string, ...phrases: string[]): Entry => ({ name, kind: 'government_letter', phrases });

export const ISSUERS: readonly Entry[] = [
  // Banks and card issuers (the largest US ones by deposits and cards).
  bank('Chase', 'JPMORGAN CHASE', 'CHASE BANK', 'CHASE COM', 'CHASE SAPPHIRE', 'CHASE FREEDOM', 'CHASE TOTAL CHECKING', 'CHASE SAVINGS'),
  bank('Bank of America', 'BANK OF AMERICA', 'BANKOFAMERICA COM', 'MERRILL LYNCH'),
  bank('Wells Fargo', 'WELLS FARGO', 'WELLSFARGO COM'),
  bank('Citi', 'CITIBANK', 'CITIGROUP', 'CITI CARDS', 'CITI COM', 'CITI CUSTOM CASH', 'CITI DOUBLE CASH'),
  bank('Capital One', 'CAPITAL ONE', 'CAPITALONE COM'),
  bank('U.S. Bank', 'U S BANK', 'US BANK NATIONAL', 'USBANK COM', 'U S BANCORP', 'US BANCORP'),
  bank('PNC', 'PNC BANK', 'PNC COM'),
  bank('Truist', 'TRUIST', 'SUNTRUST', 'BB T', 'BRANCH BANKING AND TRUST'),
  bank('TD Bank', 'TD BANK', 'TDBANK COM'),
  bank('Ally', 'ALLY BANK', 'ALLY FINANCIAL', 'ALLY COM'),
  bank('Discover', 'DISCOVER BANK', 'DISCOVER CARD', 'DISCOVER COM', 'DISCOVER FINANCIAL'),
  bank('American Express', 'AMERICAN EXPRESS', 'AMERICANEXPRESS COM', 'AMEX'),
  bank('Navy Federal Credit Union', 'NAVY FEDERAL'),
  bank('USAA', 'USAA FEDERAL SAVINGS', 'USAA SAVINGS BANK', 'USAA COM'),
  bank('Regions', 'REGIONS BANK', 'REGIONS FINANCIAL', 'REGIONS COM'),
  bank('Fifth Third', 'FIFTH THIRD', '53 COM'),
  bank('Huntington', 'HUNTINGTON NATIONAL BANK', 'HUNTINGTON BANK', 'HUNTINGTON COM'),
  bank('KeyBank', 'KEYBANK', 'KEY BANK'),
  bank('Citizens', 'CITIZENS BANK', 'CITIZENS FINANCIAL'),
  bank('M&T Bank', 'M T BANK', 'MTB COM'),
  bank('Synchrony', 'SYNCHRONY BANK', 'SYNCHRONY'),
  bank('Barclays', 'BARCLAYS BANK DELAWARE', 'BARCLAYS US'),
  bank('Chime', 'CHIME FINANCIAL', 'CHIME COM', 'CHIME CHECKING'),
  bank('SoFi', 'SOFI BANK', 'SOFI COM'),
  bank('Varo', 'VARO BANK', 'VARO MONEY'),
  bank('Charles Schwab', 'CHARLES SCHWAB', 'SCHWAB BANK', 'SCHWAB COM'),
  bank('Fidelity', 'FIDELITY INVESTMENTS', 'FIDELITY BROKERAGE', 'FIDELITY COM'),
  bank('Vanguard', 'VANGUARD BROKERAGE', 'THE VANGUARD GROUP', 'VANGUARD COM'),
  bank('Goldman Sachs', 'GOLDMAN SACHS BANK', 'MARCUS BY GOLDMAN SACHS', 'APPLE CARD'),
  bank('Santander', 'SANTANDER BANK'),
  bank('BMO', 'BMO HARRIS', 'BMO BANK'),
  bank('First Citizens', 'FIRST CITIZENS BANK'),
  bank('Comerica', 'COMERICA'),
  bank('Zions', 'ZIONS BANCORPORATION', 'ZIONS BANK'),
  bank('Cadence Bank', 'CADENCE BANK'),
  bank('Synovus', 'SYNOVUS'),
  bank('BankUnited', 'BANKUNITED'),
  bank('Seacoast Bank', 'SEACOAST BANK', 'SEACOAST NATIONAL BANK'),
  bank('Ameris Bank', 'AMERIS BANK'),
  bank('Woodforest', 'WOODFOREST NATIONAL BANK', 'WOODFOREST'),
  bank('Current', 'CURRENT COM', 'CHOICE FINANCIAL GROUP'),
  bank('Cash App', 'CASH APP', 'SUTTON BANK'),
  bank('PayPal', 'PAYPAL BALANCE', 'PAYPAL COM'),
  bank('Pentagon Federal Credit Union', 'PENTAGON FEDERAL', 'PENFED'),
  bank('Alliant Credit Union', 'ALLIANT CREDIT UNION'),
  bank('BECU', 'BOEING EMPLOYEES CREDIT UNION', 'BECU'),
  bank('SchoolsFirst', 'SCHOOLSFIRST'),
  bank('State Employees Credit Union', 'STATE EMPLOYEES CREDIT UNION'),
  // Florida (Gainesville first): banks and credit unions.
  bank('Campus USA Credit Union', 'CAMPUS USA CREDIT UNION', 'CAMPUS USA', 'CAMPUSUSA ORG'),
  bank('VyStar Credit Union', 'VYSTAR'),
  bank('Suncoast Credit Union', 'SUNCOAST CREDIT UNION', 'SUNCOAST SCHOOLS'),
  bank('MidFlorida Credit Union', 'MIDFLORIDA', 'MID FLORIDA CREDIT UNION'),
  bank('Fairwinds Credit Union', 'FAIRWINDS'),
  bank('Florida Credit Union', 'FLORIDA CREDIT UNION', 'FLCU ORG'),
  bank('Space Coast Credit Union', 'SPACE COAST CREDIT UNION'),
  bank('Achieva Credit Union', 'ACHIEVA CREDIT UNION'),
  bank('Grow Financial', 'GROW FINANCIAL FEDERAL CREDIT UNION', 'GROW FINANCIAL'),
  bank('Capital City Bank', 'CAPITAL CITY BANK'),
  bank('Drummond Community Bank', 'DRUMMOND COMMUNITY BANK'),
  // Texas (Austin later): banks and credit unions.
  bank('Frost Bank', 'FROST BANK', 'FROSTBANK COM'),
  bank('Texas Capital Bank', 'TEXAS CAPITAL BANK'),
  bank('Amplify Credit Union', 'AMPLIFY CREDIT UNION', 'GOAMPLIFY'),
  bank('UFCU', 'UNIVERSITY FEDERAL CREDIT UNION', 'UFCU'),
  bank('Randolph-Brooks', 'RANDOLPH BROOKS', 'RBFCU'),
  bank('Greater Texas Credit Union', 'GREATER TEXAS FEDERAL CREDIT UNION', 'GREATER TEXAS CREDIT UNION'),
  bank('A+ Federal Credit Union', 'APLUSFCU'),
  bank('PlainsCapital Bank', 'PLAINSCAPITAL'),
  bank('Prosperity Bank', 'PROSPERITY BANK'),
  bank('Broadway Bank', 'BROADWAY BANK'),
  // Utilities: Gainesville and Florida.
  utility('Gainesville Regional Utilities', 'GAINESVILLE REGIONAL UTILITIES', 'GRU COM', 'GRU UTILITY'),
  utility('Clay Electric Cooperative', 'CLAY ELECTRIC'),
  utility('Duke Energy', 'DUKE ENERGY', 'DUKE ENERGY FLORIDA'),
  utility('Florida Power & Light', 'FLORIDA POWER LIGHT', 'FLORIDA POWER AND LIGHT', 'FPL COM'),
  utility('TECO Tampa Electric', 'TAMPA ELECTRIC', 'TECO ENERGY', 'TECO PEOPLES GAS', 'PEOPLES GAS'),
  utility('JEA', 'JEA COM', 'JACKSONVILLE ELECTRIC AUTHORITY'),
  utility('City of Tallahassee Utilities', 'CITY OF TALLAHASSEE UTILITIES', 'TALGOV COM'),
  utility('Florida Public Utilities', 'FLORIDA PUBLIC UTILITIES'),
  utility('Orlando Utilities Commission', 'ORLANDO UTILITIES COMMISSION', 'OUC COM'),
  utility('Central Florida Electric Cooperative', 'CENTRAL FLORIDA ELECTRIC COOPERATIVE'),
  utility('Alachua County Utilities', 'ALACHUA COUNTY SOLID WASTE', 'CITY OF ALACHUA UTILITIES'),
  // Utilities: Austin and Texas.
  utility('Austin Energy', 'AUSTIN ENERGY'),
  utility('City of Austin Utilities', 'CITY OF AUSTIN UTILITIES', 'AUSTIN WATER', 'AUSTIN RESOURCE RECOVERY'),
  utility('Texas Gas Service', 'TEXAS GAS SERVICE'),
  utility('Atmos Energy', 'ATMOS ENERGY'),
  utility('CenterPoint Energy', 'CENTERPOINT ENERGY', 'CENTERPOINT'),
  utility('Oncor', 'ONCOR ELECTRIC DELIVERY', 'ONCOR'),
  utility('TXU Energy', 'TXU ENERGY'),
  utility('Reliant Energy', 'RELIANT ENERGY', 'RELIANT COM'),
  utility('Green Mountain Energy', 'GREEN MOUNTAIN ENERGY'),
  utility('Pedernales Electric Cooperative', 'PEDERNALES ELECTRIC', 'PEC COOP'),
  utility('Bluebonnet Electric Cooperative', 'BLUEBONNET ELECTRIC'),
  utility('Direct Energy', 'DIRECT ENERGY'),
  utility('Gexa Energy', 'GEXA ENERGY'),
  // National utilities.
  utility('Georgia Power', 'GEORGIA POWER'),
  utility('Dominion Energy', 'DOMINION ENERGY'),
  utility('Xcel Energy', 'XCEL ENERGY'),
  utility('PG&E', 'PACIFIC GAS AND ELECTRIC', 'PG E'),
  utility('Southern California Edison', 'SOUTHERN CALIFORNIA EDISON'),
  utility('Con Edison', 'CON EDISON', 'CONSOLIDATED EDISON'),
  utility('ComEd', 'COMMONWEALTH EDISON', 'COMED'),
  utility('National Grid', 'NATIONAL GRID'),
  utility('American Water', 'AMERICAN WATER'),
  // Phone, internet and TV.
  telecom('AT&T', 'AT T', 'ATT COM', 'AT T WIRELESS', 'AT T INTERNET'),
  telecom('Verizon', 'VERIZON', 'VERIZON WIRELESS', 'VERIZON FIOS'),
  telecom('T-Mobile', 'T MOBILE', 'TMOBILE COM'),
  telecom('Xfinity', 'XFINITY', 'COMCAST'),
  telecom('Spectrum', 'SPECTRUM COM', 'CHARTER COMMUNICATIONS', 'SPECTRUM INTERNET', 'SPECTRUM MOBILE'),
  telecom('Cox', 'COX COMMUNICATIONS', 'COX COM'),
  telecom('Frontier', 'FRONTIER COMMUNICATIONS', 'FRONTIER COM', 'FRONTIER FIBER'),
  telecom('Google Fiber', 'GOOGLE FIBER'),
  telecom('Starlink', 'STARLINK'),
  telecom('Cricket Wireless', 'CRICKET WIRELESS'),
  telecom('Metro by T-Mobile', 'METRO BY T MOBILE', 'METROPCS'),
  telecom('Boost Mobile', 'BOOST MOBILE'),
  telecom('Visible', 'VISIBLE WIRELESS', 'VISIBLE COM'),
  telecom('Mint Mobile', 'MINT MOBILE'),
  telecom('US Cellular', 'US CELLULAR', 'U S CELLULAR'),
  telecom('CenturyLink', 'CENTURYLINK', 'LUMEN TECHNOLOGIES', 'QUANTUM FIBER'),
  telecom('Windstream', 'WINDSTREAM', 'KINETIC BY WINDSTREAM'),
  telecom('Optimum', 'OPTIMUM ONLINE', 'OPTIMUM COM', 'OPTIMUM MOBILE', 'ALTICE USA'),
  telecom('Astound', 'ASTOUND BROADBAND', 'GRANDE COMMUNICATIONS', 'RCN TELECOM'),
  telecom('DIRECTV', 'DIRECTV'),
  telecom('DISH', 'DISH NETWORK'),
  // Insurance.
  insurer('State Farm', 'STATE FARM'),
  insurer('GEICO', 'GEICO', 'GOVERNMENT EMPLOYEES INSURANCE'),
  insurer('Progressive', 'PROGRESSIVE INSURANCE', 'PROGRESSIVE CASUALTY', 'PROGRESSIVE AMERICAN', 'PROGRESSIVE COM'),
  insurer('Allstate', 'ALLSTATE'),
  insurer('USAA Insurance', 'USAA CASUALTY', 'USAA GENERAL INDEMNITY', 'UNITED SERVICES AUTOMOBILE ASSOCIATION'),
  insurer('Liberty Mutual', 'LIBERTY MUTUAL'),
  insurer('Farmers Insurance', 'FARMERS INSURANCE'),
  insurer('Nationwide', 'NATIONWIDE MUTUAL', 'NATIONWIDE INSURANCE'),
  insurer('Travelers', 'TRAVELERS INSURANCE', 'THE TRAVELERS'),
  insurer('American Family Insurance', 'AMERICAN FAMILY INSURANCE'),
  insurer('Citizens Property Insurance', 'CITIZENS PROPERTY INSURANCE'),
  insurer('Universal Property', 'UNIVERSAL PROPERTY CASUALTY'),
  insurer('Lemonade', 'LEMONADE INSURANCE'),
  insurer('Florida Blue', 'FLORIDA BLUE', 'BLUE CROSS AND BLUE SHIELD OF FLORIDA'),
  insurer('Blue Cross Blue Shield of Texas', 'BLUE CROSS AND BLUE SHIELD OF TEXAS'),
  insurer('UnitedHealthcare', 'UNITEDHEALTHCARE'),
  insurer('Aetna', 'AETNA'),
  insurer('Cigna', 'CIGNA'),
  insurer('Humana', 'HUMANA'),
  // Government.
  government('Internal Revenue Service', 'INTERNAL REVENUE SERVICE', 'IRS GOV', 'DEPARTMENT OF THE TREASURY'),
  government('Social Security Administration', 'SOCIAL SECURITY ADMINISTRATION', 'SSA GOV'),
  government('U.S. Department of Veterans Affairs', 'DEPARTMENT OF VETERANS AFFAIRS'),
  government('Centers for Medicare & Medicaid Services', 'CENTERS FOR MEDICARE', 'MEDICARE GOV'),
  government('Florida Highway Safety and Motor Vehicles', 'FLORIDA DEPARTMENT OF HIGHWAY SAFETY AND MOTOR VEHICLES', 'FLHSMV', 'HIGHWAY SAFETY AND MOTOR VEHICLES'),
  government('Florida Department of Revenue', 'FLORIDA DEPARTMENT OF REVENUE'),
  government('Florida Department of Children and Families', 'DEPARTMENT OF CHILDREN AND FAMILIES', 'MYFLFAMILIES'),
  government('Alachua County', 'ALACHUA COUNTY'),
  government('Alachua County Tax Collector', 'ALACHUA COUNTY TAX COLLECTOR'),
  government('Alachua County Property Appraiser', 'ALACHUA COUNTY PROPERTY APPRAISER'),
  government('Alachua County Supervisor of Elections', 'ALACHUA COUNTY SUPERVISOR OF ELECTIONS'),
  government('City of Gainesville', 'CITY OF GAINESVILLE'),
  government('Texas Department of Public Safety', 'TEXAS DEPARTMENT OF PUBLIC SAFETY', 'TEXAS DPS'),
  government('Texas Department of Motor Vehicles', 'TEXAS DEPARTMENT OF MOTOR VEHICLES', 'TXDMV'),
  government('Travis County', 'TRAVIS COUNTY'),
  government('Travis Central Appraisal District', 'TRAVIS CENTRAL APPRAISAL DISTRICT'),
  government('City of Austin', 'CITY OF AUSTIN'),
  government('County Tax Collector', 'TAX COLLECTOR'),
  government('Property Appraiser', 'PROPERTY APPRAISER'),
  government('Supervisor of Elections', 'SUPERVISOR OF ELECTIONS'),
];

/** Folded once, longest phrases first (a utility's "CITY OF AUSTIN UTILITIES" before the city's own "CITY OF AUSTIN"). */
const PHRASES = ISSUERS.flatMap((issuer) => issuer.phrases.map((phrase) => ({ phrase: foldText(phrase), issuer: { name: issuer.name, kind: issuer.kind } as Issuer }))).sort(
  (a, b) => b.phrase.length - a.phrase.length,
);

/** The share of a document's text where its letterhead and mailing block are. */
const LETTERHEAD_SHARE = 0.4;

/**
 * The sender a proof's text names: a phrase in its letterhead (the first 40% of the text) first, else anywhere in it.
 * Undefined when none of ours is named.
 */
export function findIssuer(text: string): Issuer | undefined {
  const folded = foldText(text);
  if (!folded) return undefined;
  const head = ` ${folded.slice(0, Math.max(200, Math.round(folded.length * LETTERHEAD_SHARE)))} `;
  const whole = ` ${folded} `;
  for (const area of [head, whole]) {
    const match = PHRASES.find(({ phrase }) => area.includes(` ${phrase} `));
    if (match) return match.issuer;
  }
  return undefined;
}
