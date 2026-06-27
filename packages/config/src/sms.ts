export interface SmsProvider {
  sendOtp(destination: string, code: string): Promise<void>;
}

export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(destination: string, code: string): Promise<void> {
    console.log(`[sms] OTP for ${destination}: ${code}`);
  }
}

export function createSmsProvider(provider: "console"): SmsProvider {
  switch (provider) {
    case "console":
      return new ConsoleSmsProvider();
  }
}
