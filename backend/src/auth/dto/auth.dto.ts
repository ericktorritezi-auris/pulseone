import { IsEmail, IsString, IsOptional, MinLength, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

// Mínimo 8 caracteres, 1 maiúscula, 1 especial, letras e números — PRD seção 7
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[!@#$&*])(?=.*[0-9])(?=.*[a-z]).{8,}$/;

export class RegisterDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  areaId: string;

  @IsString()
  positionId: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, {
    message: 'A senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 especial, letras e números.',
  })
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, {
    message: 'A senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 especial, letras e números.',
  })
  newPassword: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, {
    message: 'A senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 especial, letras e números.',
  })
  newPassword: string;
}
