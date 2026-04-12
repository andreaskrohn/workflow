import '@testing-library/jest-dom'

// Silence process.stderr in tests so intentional CSRF-mismatch 403 responses
// don't flood test output. Tests that specifically assert on stderr content
// (e.g. csrf.test.ts) spy on process.stderr.write themselves, which takes
// precedence over this global mock.
jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
