import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

// Mínimo 8 caracteres, 1 maiúscula, 1 especial, letras e números — PRD seção 7
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[!@#$&*])(?=.*[0-9])(?=.*[a-z]).{8,}$/;

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
