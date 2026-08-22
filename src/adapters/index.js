import TypeORM from './typeorm'
import Prisma from './prisma'
import Fauna from './fauna'
import Drizzle from './drizzle'

export default {
  Default: TypeORM.Adapter,
  TypeORM,
  Prisma,
  Fauna,
  Drizzle
}
