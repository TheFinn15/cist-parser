import {ExtraInfoType} from "./ExtraInfoType";

export type TimeTableType = {
  name: string
  time: string
  date: string
  type: string
  cabinet: string
  extraInfo?: ExtraInfoType
};
