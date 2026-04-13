import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthPayload {
  userId: string
  barbershopId: string
  role: string
}

declare global {
  namespace Express {
    interface Request { user?: AuthPayload }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token não fornecido' })

  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET!) as AuthPayload
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}

export const requireRole = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: 'Acesso não autorizado' })
    next()
  }
