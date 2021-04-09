export type ExtraInfoType = {
  shortName: string
  fullName: string
  countsLessons: {
    lecture: {
      info: string
      counts: number
    }
    laba: {
      info: string
      counts: number
    }
    practice: {
      info: string
      counts: number
    }
    consult: {
      info: string
      counts: number
    }
    exam: {
      info: string
      counts: number
    }
    pass: {
      info: string
      counts: number
    }
  }
}
