// Add Chrome API types to Window interface
interface Window {
  chrome?: {
    runtime: any;
    [key: string]: any;
  };
  Notification?: {
    requestPermission: () => Promise<string>;
    [key: string]: any;
  };
}

// Ensure this file is treated as a module
export {};
