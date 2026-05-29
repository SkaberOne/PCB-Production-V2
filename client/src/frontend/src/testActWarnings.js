const ACT_DEPRECATED_WARNING = 'ReactDOMTestUtils.act is deprecated in favor of React.act';

export function suppressActDeprecatedWarning() {
    const spy = jest.spyOn(console, 'error').mockImplementation((...args) => {
        if (args.some((arg) => typeof arg === 'string' && arg.includes(ACT_DEPRECATED_WARNING))) {
            return;
        }
    });

    return () => spy.mockRestore();
}
