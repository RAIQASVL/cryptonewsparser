declare module 'input' {
    function text(prompt: string): Promise<string>;
    function password(prompt: string): Promise<string>;
    function select(prompt: string, options: string[]): Promise<string>;
    function confirm(prompt: string): Promise<boolean>;

    export default {
        text,
        password,
        select,
        confirm
    };
} 