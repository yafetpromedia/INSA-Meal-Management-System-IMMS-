import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  /** Preferred login id */
  @ValidateIf((o: LoginDto) => !o.email)
  @IsString()
  @MinLength(3)
  username?: string;

  /** Still accepted for older clients / autofill */
  @ValidateIf((o: LoginDto) => !o.username)
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  /** Username or email */
  @IsString()
  @MinLength(3)
  account!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Required when changing password */
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}
