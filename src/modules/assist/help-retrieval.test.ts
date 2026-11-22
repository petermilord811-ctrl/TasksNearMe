import { describe, expect, it } from 'vitest';
import { listHelpArticleTexts } from '@/modules/content/loaders';
import { keywords, pickHelpArticles, rankHelpArticles, stem } from './help-retrieval';

const english = listHelpArticleTexts('en');
const spanish = listHelpArticleTexts('es');
const best = (question: string, articles = english) => rankHelpArticles(question, articles)[0]?.article.slug;

describe('help retrieval for the support assistant', () => {
  it('reads every help article as plain text, in both languages', () => {
    expect(english.length).toBeGreaterThan(5);
    expect(spanish.map((article) => article.slug).sort()).toEqual(english.map((article) => article.slug).sort());
    for (const article of english) {
      expect(article.text).not.toMatch(/\*\*|^#{1,6}\s|\[!/m);
      expect(article.text.length).toBeGreaterThan(20);
    }
  });

  it('trims English endings and leaves common words out', () => {
    expect(stem('charged')).toBe('charg');
    expect(stem('charges')).toBe('charg');
    expect(keywords('When am I charged for my booking?')).toEqual(['charg', 'book']);
    expect(keywords('¿Cuándo me cobran?')).toEqual(['cobran']);
  });

  it('finds the article a question is about', () => {
    expect(best('When am I charged?')).toBe('when-am-i-charged');
    expect(best('when do I get paid as a helper')).toBe('when-do-i-get-paid');
    expect(best('who can see my address')).toBe('who-sees-my-address');
    expect(best('I need to cancel my booking')).toBe('cancel-a-booking');
    expect(best('how do I report a problem with a task')).toBe('report-a-problem');
    expect(best('¿Cuándo me cobran?', spanish)).toBe('when-am-i-charged');
  });

  it('gives nothing for a question with no words worth matching, and leans on the chat for a follow-up', () => {
    expect(rankHelpArticles('and then?', english)).toEqual([]);
    expect(pickHelpArticles('and then?', ['When am I charged?'], english)[0]?.slug).toBe('when-am-i-charged');
    expect(pickHelpArticles('When am I charged?', [], english, 2)).toHaveLength(2);
  });
});
