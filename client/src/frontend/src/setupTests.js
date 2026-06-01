/**
 * CRA global test setup — loaded automatically by react-scripts before each test file.
 * Extends Jest's expect with @testing-library/jest-dom matchers (toBeInTheDocument, etc.).
 */
import '@testing-library/jest-dom';

// jsdom n'implémente pas Element.scrollIntoView : sans ce polyfill, les
// composants qui l'appellent (ex. BomReviewTab) lèvent une TypeError dans un
// setTimeout, ce qui fait échouer/timeouter les tests qui les montent.
if (typeof window !== 'undefined' && window.HTMLElement) {
    window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || function scrollIntoView() {};
}
